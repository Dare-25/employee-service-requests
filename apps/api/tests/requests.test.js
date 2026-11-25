const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');

const PASSWORD = 'Password123';
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let alice, bob, admin, itAgent;
const teamIds = {};

async function register(email, fullName) {
  const res = await request(app).post('/auth/register')
    .send({ email, password: PASSWORD, full_name: fullName });
  expect(res.status).toBe(201);
}

async function login(email) {
  const res = await request(app).post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function createRequest(token, overrides = {}) {
  const res = await request(app).post('/requests').set(auth(token)).send({
    title: 'Laptop will not start',
    description: 'It shows a black screen',
    category: 'IT',
    priority: 'HIGH',
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body;
}

const setStatus = (token, id, status) =>
  request(app).patch(`/requests/${id}/status`).set(auth(token)).send({ status });

beforeAll(async () => {
  // Safety: never wipe the real database.
  const db = await pool.query('SELECT current_database() AS name');
  if (db.rows[0].name !== 'esr_test') {
    throw new Error(`Tests must run against esr_test, not ${db.rows[0].name}`);
  }
  await pool.query('TRUNCATE audit_logs, comments, requests, users RESTART IDENTITY CASCADE');
  const teams = await pool.query('SELECT id, category FROM teams');
  for (const t of teams.rows) teamIds[t.category] = t.id;

  await register('alice@test.com', 'Alice Employee');
  await register('bob@test.com', 'Bob Employee');
  await register('admin@test.com', 'Ada Admin');
  await register('it.agent@test.com', 'Ian IT Agent');
  await pool.query("UPDATE users SET role='ADMIN' WHERE email='admin@test.com'");
  await pool.query(
    "UPDATE users SET role='AGENT', team_id=$1 WHERE email='it.agent@test.com'",
    [teamIds.IT]
  );
  alice = await login('alice@test.com');
  bob = await login('bob@test.com');
  admin = await login('admin@test.com');
  itAgent = await login('it.agent@test.com');
});

afterAll(async () => {
  await pool.end();
});

describe('authentication', () => {
  test('registering creates an EMPLOYEE', async () => {
    const res = await request(app).post('/auth/register')
      .send({ email: 'new@test.com', password: PASSWORD, full_name: 'New Person' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('EMPLOYEE');
  });

  test('a duplicate email is refused with 409', async () => {
    const res = await request(app).post('/auth/register')
      .send({ email: 'alice@test.com', password: PASSWORD, full_name: 'Alice Again' });
    expect(res.status).toBe(409);
  });

  test('a short password is refused with 400', async () => {
    const res = await request(app).post('/auth/register')
      .send({ email: 'short@test.com', password: 'short', full_name: 'Short Pass' });
    expect(res.status).toBe(400);
  });

  test('a wrong password is refused with 401', async () => {
    const res = await request(app).post('/auth/login')
      .send({ email: 'alice@test.com', password: 'WrongPassword' });
    expect(res.status).toBe(401);
  });

  test('a request without a token is refused with 401', async () => {
    const res = await request(app).get('/requests');
    expect(res.status).toBe(401);
  });
});

describe('creating requests', () => {
  test('an IT request is routed to IT and gets an 8 hour deadline for HIGH priority', async () => {
    const r = await createRequest(alice, { category: 'IT', priority: 'HIGH' });
    expect(r.status).toBe('OPEN');
    expect(r.team_id).toBe(teamIds.IT);
    expect(new Date(r.due_at) - new Date(r.created_at)).toBe(8 * 3600 * 1000);
  });

  test('an HR request is routed to HR and gets a 4 hour deadline for URGENT priority', async () => {
    const r = await createRequest(alice, { category: 'HR', priority: 'URGENT' });
    expect(r.team_id).toBe(teamIds.HR);
    expect(new Date(r.due_at) - new Date(r.created_at)).toBe(4 * 3600 * 1000);
  });

  test('a FACILITIES request gets a 72 hour deadline for LOW priority', async () => {
    const r = await createRequest(alice, { category: 'FACILITIES', priority: 'LOW' });
    expect(r.team_id).toBe(teamIds.FACILITIES);
    expect(new Date(r.due_at) - new Date(r.created_at)).toBe(72 * 3600 * 1000);
  });

  test('invalid input is refused with 400 and a list of problems', async () => {
    const res = await request(app).post('/requests').set(auth(alice))
      .send({ title: 'Hi', description: 'Short but valid', category: 'PAYROLL', priority: 'ASAP' });
    expect(res.status).toBe(400);
    expect(res.body.details.length).toBeGreaterThanOrEqual(3);
  });

  test('an agent cannot create requests', async () => {
    const res = await request(app).post('/requests').set(auth(itAgent))
      .send({ title: 'Agent request', description: 'Not allowed', category: 'IT', priority: 'LOW' });
    expect(res.status).toBe(403);
  });
});

describe('who can see which requests', () => {
  test('the owner can open their request, another employee cannot', async () => {
    const r = await createRequest(alice);
    const own = await request(app).get(`/requests/${r.id}`).set(auth(alice));
    expect(own.status).toBe(200);
    const other = await request(app).get(`/requests/${r.id}`).set(auth(bob));
    expect(other.status).toBe(403);
  });

  test('an employee lists only their own requests', async () => {
    await createRequest(bob, { title: 'Bob monitor flickers' });
    const res = await request(app).get('/requests').set(auth(bob));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const bobId = (await pool.query("SELECT id FROM users WHERE email='bob@test.com'")).rows[0].id;
    expect(res.body.every((r) => r.requester_id === bobId)).toBe(true);
  });

  test('an IT agent cannot open an HR request and sees only IT requests in the list', async () => {
    const hr = await createRequest(alice, { category: 'HR', priority: 'MEDIUM' });
    const open = await request(app).get(`/requests/${hr.id}`).set(auth(itAgent));
    expect(open.status).toBe(403);
    const list = await request(app).get('/requests').set(auth(itAgent));
    expect(list.body.every((r) => r.team_id === teamIds.IT)).toBe(true);
  });

  test('an admin sees requests from every team', async () => {
    const res = await request(app).get('/requests').set(auth(admin));
    const teams = new Set(res.body.map((r) => r.team_id));
    expect(teams.size).toBeGreaterThan(1);
  });

  test('unknown and non-numeric ids give 404 and 400', async () => {
    expect((await request(app).get('/requests/999999').set(auth(admin))).status).toBe(404);
    expect((await request(app).get('/requests/abc').set(auth(admin))).status).toBe(400);
  });
});

describe('status flow', () => {
  test('an employee cannot change a status', async () => {
    const r = await createRequest(alice);
    expect((await setStatus(alice, r.id, 'IN_PROGRESS')).status).toBe(403);
  });

  test('an agent cannot skip from OPEN to RESOLVED', async () => {
    const r = await createRequest(alice);
    const res = await setStatus(itAgent, r.id, 'RESOLVED');
    expect(res.status).toBe(409);
  });

  test('an invalid status value is refused with 400', async () => {
    const r = await createRequest(alice);
    expect((await setStatus(itAgent, r.id, 'FLYING')).status).toBe(400);
  });

  test('the full flow works, sets the assignee and resolved_at, and a closed request cannot move', async () => {
    const r = await createRequest(alice);
    const started = await setStatus(itAgent, r.id, 'IN_PROGRESS');
    expect(started.status).toBe(200);
    expect(started.body.assignee_id).not.toBeNull();
    const resolved = await setStatus(itAgent, r.id, 'RESOLVED');
    expect(resolved.body.resolved_at).not.toBeNull();
    expect((await setStatus(itAgent, r.id, 'CLOSED')).body.status).toBe('CLOSED');
    expect((await setStatus(itAgent, r.id, 'IN_PROGRESS')).status).toBe(409);
  });

  test('an agent cannot change the status of another team\'s request', async () => {
    const hr = await createRequest(alice, { category: 'HR' });
    expect((await setStatus(itAgent, hr.id, 'IN_PROGRESS')).status).toBe(403);
  });
});

describe('cancelling requests', () => {
  test('the owner can cancel an OPEN request, and cannot cancel it twice', async () => {
    const r = await createRequest(alice);
    const first = await request(app).post(`/requests/${r.id}/cancel`).set(auth(alice));
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('CANCELLED');
    const second = await request(app).post(`/requests/${r.id}/cancel`).set(auth(alice));
    expect(second.status).toBe(409);
  });

  test('another employee cannot cancel it', async () => {
    const r = await createRequest(alice);
    const res = await request(app).post(`/requests/${r.id}/cancel`).set(auth(bob));
    expect(res.status).toBe(403);
  });

  test('a request that is already IN_PROGRESS cannot be cancelled', async () => {
    const r = await createRequest(alice);
    await setStatus(itAgent, r.id, 'IN_PROGRESS');
    const res = await request(app).post(`/requests/${r.id}/cancel`).set(auth(alice));
    expect(res.status).toBe(409);
  });
});

describe('SLA breach flag', () => {
  const flag = async (id) =>
    (await request(app).get(`/requests/${id}`).set(auth(alice))).body.sla_breached;

  test('a new request is not breached', async () => {
    const r = await createRequest(alice);
    expect(await flag(r.id)).toBe(false);
  });

  test('an open request past its due date is breached', async () => {
    const r = await createRequest(alice);
    await pool.query("UPDATE requests SET due_at = NOW() - interval '1 hour' WHERE id = $1", [r.id]);
    expect(await flag(r.id)).toBe(true);
  });

  test('a request resolved before its due date is not breached', async () => {
    const r = await createRequest(alice);
    await setStatus(itAgent, r.id, 'IN_PROGRESS');
    await setStatus(itAgent, r.id, 'RESOLVED');
    expect(await flag(r.id)).toBe(false);
  });

  test('a request resolved after its due date is breached', async () => {
    const r = await createRequest(alice);
    await setStatus(itAgent, r.id, 'IN_PROGRESS');
    await pool.query("UPDATE requests SET due_at = NOW() - interval '1 hour' WHERE id = $1", [r.id]);
    await setStatus(itAgent, r.id, 'RESOLVED');
    expect(await flag(r.id)).toBe(true);
  });

  test('a cancelled request is never breached', async () => {
    const r = await createRequest(alice);
    await pool.query("UPDATE requests SET due_at = NOW() - interval '1 hour' WHERE id = $1", [r.id]);
    await request(app).post(`/requests/${r.id}/cancel`).set(auth(alice));
    expect(await flag(r.id)).toBe(false);
  });
});

describe('comments', () => {
  test('the owner can comment, another employee cannot, and empty comments are refused', async () => {
    const r = await createRequest(alice);
    const ok = await request(app).post(`/requests/${r.id}/comments`).set(auth(alice)).send({ body: 'It is urgent' });
    expect(ok.status).toBe(201);
    const other = await request(app).post(`/requests/${r.id}/comments`).set(auth(bob)).send({ body: 'Me too' });
    expect(other.status).toBe(403);
    const empty = await request(app).post(`/requests/${r.id}/comments`).set(auth(alice)).send({ body: '   ' });
    expect(empty.status).toBe(400);
  });

  test('comments appear on the request and are refused once it is closed', async () => {
    const r = await createRequest(alice);
    await request(app).post(`/requests/${r.id}/comments`).set(auth(alice)).send({ body: 'First comment' });
    const view = await request(app).get(`/requests/${r.id}`).set(auth(alice));
    expect(view.body.comments).toHaveLength(1);
    await setStatus(itAgent, r.id, 'IN_PROGRESS');
    await setStatus(itAgent, r.id, 'RESOLVED');
    await setStatus(itAgent, r.id, 'CLOSED');
    const late = await request(app).post(`/requests/${r.id}/comments`).set(auth(alice)).send({ body: 'Too late' });
    expect(late.status).toBe(409);
  });
});

describe('audit log', () => {
  test('an admin sees creation and status changes with the right actors', async () => {
    const res = await request(app).get('/admin/audit-logs').set(auth(admin));
    expect(res.status).toBe(200);
    const actions = res.body.map((a) => a.action);
    expect(actions).toContain('REQUEST_CREATED');
    expect(actions).toContain('REQUEST_STATUS_CLOSED');
    expect(actions).toContain('COMMENT_ADDED');
    const created = res.body.find((a) => a.action === 'REQUEST_CREATED');
    expect(created.actor).toMatch(/@test\.com$/);
  });

  test('an employee and an agent cannot read it', async () => {
    expect((await request(app).get('/admin/audit-logs').set(auth(alice))).status).toBe(403);
    expect((await request(app).get('/admin/audit-logs').set(auth(itAgent))).status).toBe(403);
  });
});

describe('dashboard', () => {
  beforeAll(async () => {
    await pool.query('TRUNCATE comments, requests RESTART IDENTITY');
    const closed = await createRequest(alice);
    await setStatus(itAgent, closed.id, 'IN_PROGRESS');
    await setStatus(itAgent, closed.id, 'RESOLVED');
    await setStatus(itAgent, closed.id, 'CLOSED');
    const overdue = await createRequest(alice, { category: 'HR' });
    await pool.query("UPDATE requests SET due_at = NOW() - interval '1 hour' WHERE id = $1", [overdue.id]);
    await createRequest(bob, { category: 'FACILITIES', priority: 'LOW' });
  });

  test('totals match the data', async () => {
    const res = await request(app).get('/admin/dashboard').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({ total: 3, active: 2, sla_breached: 1 });
    expect(res.body.by_status.find((s) => s.status === 'CLOSED').count).toBe(1);
    expect(res.body.by_status.find((s) => s.status === 'OPEN').count).toBe(2);
  });

  test('counts by team add up', async () => {
    const res = await request(app).get('/admin/dashboard').set(auth(admin));
    const total = res.body.by_team.reduce((sum, t) => sum + t.total, 0);
    expect(total).toBe(3);
  });

  test('only an admin can read the dashboard', async () => {
    expect((await request(app).get('/admin/dashboard').set(auth(alice))).status).toBe(403);
    expect((await request(app).get('/admin/dashboard').set(auth(itAgent))).status).toBe(403);
  });
});