# Work Log

## 2026-11-23
- Started Project 2 (Employee Service Request System) from the Arrowstack handbook. Created the public GitHub repo employee-service-requests.
- Reused the Project 1 setup: copied the Docker, database connection, JWT auth middleware, audit helper and login/register code, and ran npm install.
- Set up PostgreSQL 16 in Docker Compose on port 5433, so it does not clash with the Project 1 database.
- Hit two setup problems: Docker Compose said "empty compose file" because docker-compose.yml had no content, and then warned that DB_USER, DB_NAME and DB_PASSWORD were not set because the .env file was missing. Created the .env file, reset the container with `docker compose down -v`, and started it again.
- Pushed the project structure to GitHub.
- Wrote the requirements document: stakeholder, scope, three roles (Employee, Agent, Admin), SLA rules and six acceptance criteria.
- Confirmed the esr-db container is healthy and accepts connections on port 5433.
- Next: draw the ER diagram, write the first migration, then build requests, routing, status flow, SLA tracking and the dashboard.