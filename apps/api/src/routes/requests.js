const express = require('express');
const pool = require('../db');
const audit = require('../audit');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const CATEGORIES = ['IT', 'HR', 'FACILITIES'];
const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED'];
const TRANSITIONS = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  CANCELLED: [],
};

const SELECT_REQUEST = `
  SELECT r.id, r.requester_id, r.team_id, r.assignee_id, r.title, r.description,
         r.category, r.priority, r.status, r.due_at, r.resolved_at, r.created_at,
         CASE WHEN r.status = 'CANCELLED' THEN FALSE
              WHEN r.resolved_at IS NOT NULL THEN r.resolved_at > r.due_at
              ELSE NOW() > r.due_at END AS sla_breached
  FROM requests r`;

function validId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

function canAccess(user, r) {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'EMPLOYEE') return r.requester_id === user.id;
  if (user.role === 'AGENT') return r.team_id === user.team_id;
  return false;
}

function handleError(err, res) {
  if (err.http) return res.status(err.http).json(err.body);
  console.error(err.message);
  res.status(500).json({ error: 'Server error' });
}

// Run a function inside a transaction; roll back if it throws.
async function inTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Load and lock one request inside a transaction.
async function lockRequest(client, id) {
  const r = await client.query('SELECT * FROM requests WHERE id = $1 FOR UPDATE', [id]);
  if (r.rows.length === 0) throw { http: 404, body: { error: 'Request not found' } };
  return r.rows[0];
}

// Create a request: employees only. Routed by category, due date from the SLA policy.
router.post('/', requireRole('EMPLOYEE'), async (req, res) => {
  const { title, description, category, priority } = req.body;
  const problems = [];
  if (typeof title !== 'string' || title.trim().length < 3 || title.length > 200) {
    problems.push('title must be 3 to 200 characters');
  }
  if (typeof description !== 'string' || description.trim().length < 5) {
    problems.push('description must be at least 5 characters');
  }
  if (!CATEGORIES.includes(category)) problems.push(`category must be one of ${CATEGORIES.join(', ')}`);
  if (!PRIORITIES.includes(priority)) problems.push(`priority must be one of ${PRIORITIES.join(', ')}`);
  if (problems.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: problems });
  }
  try {
    const created = await inTransaction(async (client) => {
      const team = await client.query('SELECT id FROM teams WHERE category = $1', [category]);
      const sla = await client.query('SELECT hours FROM sla_policies WHERE priority = $1', [priority]);
      const result = await client.query(
        `INSERT INTO requests (requester_id, team_id, title, description, category, priority, due_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + make_interval(hours => $7))
         RETURNING id, team_id, title, category, priority, status, due_at, created_at`,
        [req.user.id, team.rows[0].id, title.trim(), description.trim(), category, priority, sla.rows[0].hours]
      );
      await audit(client, req.user.id, 'REQUEST_CREATED', 'request', result.rows[0].id);
      return result.rows[0];
    });
    res.status(201).json(created);
  } catch (err) {
    handleError(err, res);
  }
});

// List: employees see their own, agents see their team's, admins see all.
router.get('/', async (req, res) => {
  const { status } = req.query;
  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  }
  const params = [];
  const where = [];
  if (status) { params.push(status); where.push(`r.status = $${params.length}`); }
  if (req.user.role === 'EMPLOYEE') { params.push(req.user.id); where.push(`r.requester_id = $${params.length}`); }
  if (req.user.role === 'AGENT') { params.push(req.user.team_id); where.push(`r.team_id = $${params.length}`); }
  try {
    const result = await pool.query(
      `${SELECT_REQUEST} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY r.created_at DESC LIMIT 100`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    handleError(err, res);
  }
});

// One request with its comments.
router.get('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid request id' });
  try {
    const r = await pool.query(`${SELECT_REQUEST} WHERE r.id = $1`, [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Request not found' });
    if (!canAccess(req.user, r.rows[0])) return res.status(403).json({ error: 'Forbidden' });
    const comments = await pool.query(
      `SELECT c.id, u.full_name AS author, c.body, c.created_at
       FROM comments c JOIN users u ON u.id = c.author_id
       WHERE c.request_id = $1 ORDER BY c.id`,
      [req.params.id]
    );
    res.json({ ...r.rows[0], comments: comments.rows });
  } catch (err) {
    handleError(err, res);
  }
});

// Change status: agents (own team only) and admins, along the allowed flow.
router.patch('/:id/status', requireRole('AGENT', 'ADMIN'), async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid request id' });
  const { status } = req.body;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (status === 'CANCELLED') {
    return res.status(400).json({ error: 'Use POST /requests/:id/cancel to cancel a request' });
  }
  try {
    const updated = await inTransaction(async (client) => {
      const r = await lockRequest(client, Number(req.params.id));
      if (!canAccess(req.user, r)) throw { http: 403, body: { error: 'Forbidden' } };
      if (!TRANSITIONS[r.status].includes(status)) {
        throw { http: 409, body: { error: `Cannot change status from ${r.status} to ${status}` } };
      }
      const sets = ['status = $1'];
      const values = [status];
      if (status === 'IN_PROGRESS' && !r.assignee_id) {
        values.push(req.user.id);
        sets.push(`assignee_id = $${values.length}`);
      }
      if (status === 'RESOLVED') sets.push('resolved_at = NOW()');
      if (status === 'IN_PROGRESS') sets.push('resolved_at = NULL');
      values.push(r.id);
      const result = await client.query(
        `UPDATE requests SET ${sets.join(', ')} WHERE id = $${values.length}
         RETURNING id, status, assignee_id, resolved_at`,
        values
      );
      await audit(client, req.user.id, `REQUEST_STATUS_${status}`, 'request', r.id);
      return result.rows[0];
    });
    res.json(updated);
  } catch (err) {
    handleError(err, res);
  }
});

// Cancel: the requester (or an admin), only while the request is still OPEN.
router.post('/:id/cancel', requireRole('EMPLOYEE', 'ADMIN'), async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid request id' });
  try {
    const updated = await inTransaction(async (client) => {
      const r = await lockRequest(client, Number(req.params.id));
      if (!canAccess(req.user, r)) throw { http: 403, body: { error: 'Forbidden' } };
      if (r.status !== 'OPEN') {
        throw { http: 409, body: { error: `Cannot cancel a request that is ${r.status}` } };
      }
      await client.query("UPDATE requests SET status = 'CANCELLED' WHERE id = $1", [r.id]);
      await audit(client, req.user.id, 'REQUEST_STATUS_CANCELLED', 'request', r.id);
      return { id: r.id, status: 'CANCELLED' };
    });
    res.json(updated);
  } catch (err) {
    handleError(err, res);
  }
});

// Add a comment: anyone who can see the request, while it is still active.
router.post('/:id/comments', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid request id' });
  const { body } = req.body;
  if (typeof body !== 'string' || body.trim().length < 1 || body.length > 2000) {
    return res.status(400).json({ error: 'body must be 1 to 2000 characters' });
  }
  try {
    const created = await inTransaction(async (client) => {
      const r = await lockRequest(client, Number(req.params.id));
      if (!canAccess(req.user, r)) throw { http: 403, body: { error: 'Forbidden' } };
      if (['CLOSED', 'CANCELLED'].includes(r.status)) {
        throw { http: 409, body: { error: `Cannot comment on a ${r.status} request` } };
      }
      const result = await client.query(
        'INSERT INTO comments (request_id, author_id, body) VALUES ($1, $2, $3) RETURNING id, body, created_at',
        [r.id, req.user.id, body.trim()]
      );
      await audit(client, req.user.id, 'COMMENT_ADDED', 'request', r.id);
      return result.rows[0];
    });
    res.status(201).json(created);
  } catch (err) {
    handleError(err, res);
  }
});

module.exports = router;