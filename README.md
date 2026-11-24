# Employee Service Request System

An internal portal API where employees raise IT, HR and facilities requests, requests are routed to the right team, SLA deadlines are tracked and an admin dashboard shows the state of the service. Built as Project 2 of the Arrowstack Full Stack Development internship (Nov 2026).

**Status:** REST API complete and tested manually. No frontend yet (see Limitations).

## What it does

- **Employees** register, raise requests, see only their own requests, comment, and cancel a request while it is still OPEN.
- **Agents** see and work on requests for their own team, and move them through the status flow.
- **Admins** see everything, read the audit log and the dashboard.
- Each request is routed to the team for its category, gets a due date from its priority, and is flagged when it misses its SLA.
- Every important action is written to an audit log with the user who did it.

## Tech stack

Node.js (Express), PostgreSQL 16, Docker Compose, JWT authentication (jsonwebtoken), bcrypt password hashing (bcryptjs), `pg` for database access.

## Setup

Requirements: Node.js, Docker Desktop (running), Git. Developed with Node v26 on Windows 11 and PowerShell.

1. **Clone and configure**
   ```powershell
   git clone https://github.com/Dare-25/employee-service-requests.git
   cd employee-service-requests
   copy .env.example .env
   ```
   Open `.env` and set your own `DB_PASSWORD` and a long random `JWT_SECRET`. Never commit `.env`.

2. **Start the database** (it listens on port 5433)
   ```powershell
   docker compose up -d
   docker compose ps        # wait until esr-db shows (healthy)
   ```

3. **Create the tables and seed data** (run once on a fresh database)
   ```powershell
   Get-Content db\migrations\001_init.sql | docker exec -i esr-db psql -U esr_user -d esr_requests
   ```
   (Use your own `DB_USER` and `DB_NAME` if you changed them in `.env`.) This also creates the three teams (IT Support, Human Resources, Facilities) and the SLA policies.

4. **Install and start the API**
   ```powershell
   cd apps\api
   npm install
   npm run dev
   ```
   The API runs on http://localhost:3000. Check that http://localhost:3000/health returns `{"status":"ok","database":"connected"}`.

5. **Create an admin and an agent**
   Anyone who registers becomes an EMPLOYEE. Register the users through the API, then promote them in the database (an agent must have a team):
   ```powershell
   docker exec -it esr-db psql -U esr_user -d esr_requests -c "UPDATE users SET role='ADMIN' WHERE email='admin@company.com';"
   docker exec -it esr-db psql -U esr_user -d esr_requests -c "UPDATE users SET role='AGENT', team_id=(SELECT id FROM teams WHERE category='IT') WHERE email='it.agent@company.com';"
   ```
   Log in again after a role change, because the role is stored inside the token.

## SLA rules

| Priority | Hours to resolve |
|---|---|
| URGENT | 4 |
| HIGH | 8 |
| MEDIUM | 24 |
| LOW | 72 |

The due date is calculated once, when the request is created, from the `sla_policies` table. A request counts as breached if it was resolved after its due date, or if it is unresolved and past its due date. Cancelled requests are never breached.

## API overview

| Method and path | Who | Purpose |
|---|---|---|
| POST /auth/register | anyone | Create an EMPLOYEE account |
| POST /auth/login | anyone | Returns a JWT (valid 8 hours) |
| POST /requests | employee | Create a request (title, description, category, priority) |
| GET /requests | logged-in | Employees see their own, agents their team's, admins all; optional `?status=` |
| GET /requests/:id | owner, team agent, admin | One request with its comments and SLA flag |
| PATCH /requests/:id/status | agent (own team), admin | OPEN, IN_PROGRESS, RESOLVED, CLOSED (RESOLVED can reopen to IN_PROGRESS) |
| POST /requests/:id/cancel | requester, admin | Cancel while OPEN |
| POST /requests/:id/comments | anyone who can see the request | Add a comment (not on CLOSED or CANCELLED requests) |
| GET /admin/audit-logs | admin | Latest 100 audit entries |
| GET /admin/dashboard | admin | Totals, counts by status, category and team, SLA breaches |
| GET /health | anyone | API and database check |

Send the token as `Authorization: Bearer <token>`.

## Design decisions

- **Routing:** each category has one team, and `requests.team_id` is set from the category when the request is created.
- **SLA hours live in a table,** so they can change without code changes, and old requests keep their deadlines.
- **The breach flag is calculated when a request is read,** so it stays correct as time passes without a background job.
- **Every change runs in a transaction with a row lock** (`SELECT ... FOR UPDATE`), and the audit entry is written in the same transaction.
- **Roles are enforced on the server** (401 for no or bad token, 403 for the wrong role or team), and the user id and team come from the token, never from the request body.
- **The status flow is restricted,** so requests cannot jump to an invalid state. See `docs/design-notes.md`.

## Documentation and evidence

- `docs/requirements.md`: stakeholder, scope, roles, SLA rules and acceptance criteria
- `docs/erd.png` and `docs/schema.dbml`: data model
- `docs/design-notes.md`: design reasoning
- `docs/test-evidence.md`: what was tested and the results
- `docs/work-log.md`: dated work log

## Limitations and next steps

- **No frontend.** Everything was tested through the API with PowerShell. Next step: a small React interface.
- **No automated test suite.** Checks were run manually and recorded in `docs/test-evidence.md`. Next step: Jest and Supertest tests.
- **The SLA breach was tested by simulation:** a request's due date was moved into the past directly in the database, because waiting for a real deadline was not practical.
- **SLA time is measured in calendar hours,** not working hours.
- **No notifications,** no file attachments, no reassignment of a request to another agent, and priority and category cannot be changed after creation.
- **The first agent to start work becomes the assignee,** with no workload balancing.
- **Migrations are one plain SQL file** applied by hand, with no migration history table.
- **Agent and admin accounts are created in the database,** not through an admin screen.
- **Tokens last 8 hours** with no refresh or revocation, and there is no rate limiting.