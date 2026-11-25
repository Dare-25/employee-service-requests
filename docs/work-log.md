# Work Log

## 2026-11-23
- Started Project 2 (Employee Service Request System) from the Arrowstack handbook. Created the public GitHub repo employee-service-requests.
- Reused the Project 1 setup: copied the Docker, database connection, JWT auth middleware, audit helper and login/register code, and ran npm install.
- Set up PostgreSQL 16 in Docker Compose on port 5433 so it does not clash with the Project 1 database.
- Hit two setup problems: Docker Compose said "empty compose file" because docker-compose.yml had no content, and then warned that DB_USER, DB_NAME and DB_PASSWORD were not set because the .env file was missing. Created the .env file, reset the container with `docker compose down -v`, and started it again.
- Confirmed the esr-db container is healthy and accepts connections on port 5433.
- Wrote the requirements document: stakeholder, scope, three roles (Employee, Agent, Admin), SLA rules and six acceptance criteria.
- Drew the ER diagram (6 tables) and wrote the first migration, with seed data for the three teams and the four SLA policies.
- Changed the copied register route to use full_name and the EMPLOYEE role, and added the team to the login token.
- The API first reported the database as unreachable because Docker Desktop was not running and db.js still pointed at the Project 1 port. Started Docker Desktop and fixed the port.
- Re-ran the migration by mistake and got "already exists" errors; checked that the tables and seed data were intact.

## 2026-11-24
- Built the requests API: create (routed to a team by category, due date from the SLA policy), role-based list and view, status changes along a fixed flow, cancellation of open requests, and comments. Every change runs in a transaction with a row lock and writes an audit entry.
- Added admin endpoints for the audit log and a dashboard with totals, counts by status, category and team, and SLA breaches.
- Created test accounts (two employees, an IT agent and an admin) and tested creation and routing, privacy between employees, team isolation for agents, the status flow, comments, cancellation and invalid input. Results are in docs/test-evidence.md.
- Tested the SLA breach flag by moving a request's due date one hour into the past in the database to simulate time passing.
- Wrote the design notes.
- Next: README, a LinkedIn post, and then either automated tests or a small React frontend.

## 2026-11-25
- Added automated tests with Jest and Supertest: split the app from the server (app.js and server.js), added a separate esr_test database so tests never touch real data, and wrote 35 tests covering the checks previously done by hand.
- The test file was first empty because a terminal command was pasted into it instead of the code; replaced it with the full tests and all 35 passed, twice in a row.
- Updated the README with how to run the tests.