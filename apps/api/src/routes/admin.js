const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('ADMIN'));

// A request is breached if it was resolved late, or is unresolved and past its due date.
const BREACHED = `(CASE WHEN r.status = 'CANCELLED' THEN FALSE
                        WHEN r.resolved_at IS NOT NULL THEN r.resolved_at > r.due_at
                        ELSE NOW() > r.due_at END)`;

router.get('/audit-logs', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.created_at, u.email AS actor, a.action, a.entity, a.entity_id
       FROM audit_logs a JOIN users u ON u.id = a.actor_id
       ORDER BY a.id DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const totals = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE r.status IN ('OPEN','IN_PROGRESS'))::int AS active,
              COUNT(*) FILTER (WHERE ${BREACHED})::int AS sla_breached
       FROM requests r`
    );
    const byStatus = await pool.query(
      'SELECT status, COUNT(*)::int AS count FROM requests GROUP BY status ORDER BY status'
    );
    const byCategory = await pool.query(
      'SELECT category, COUNT(*)::int AS count FROM requests GROUP BY category ORDER BY category'
    );
    const byTeam = await pool.query(
      `SELECT t.name AS team,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE r.status IN ('OPEN','IN_PROGRESS'))::int AS active,
              COUNT(*) FILTER (WHERE ${BREACHED})::int AS sla_breached
       FROM requests r JOIN teams t ON t.id = r.team_id
       GROUP BY t.name ORDER BY t.name`
    );
    res.json({
      totals: totals.rows[0],
      by_status: byStatus.rows,
      by_category: byCategory.rows,
      by_team: byTeam.rows,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;