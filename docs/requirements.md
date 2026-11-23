# Requirements: Employee Service Request System

## 1. Business context
- **Simulated company:** A mid-sized company with about 300 employees and three support teams: IT, HR and Facilities.
- **Primary stakeholder:** The head of shared services, who is responsible for how quickly internal requests are resolved.
- **Problem:** Employees send requests by email and chat, so requests get lost, nobody knows which team owns them, and managers cannot see which ones are overdue.
- **Decision the system supports:** Which team needs more staff, and which open requests are at risk of missing their deadline.

## 2. Scope
- **In scope:** Requests for IT, HR and Facilities; automatic routing to the team for the category; status tracking; SLA deadlines and breach flags; comments; dashboard endpoints; audit log.
- **Out of scope:** Email or chat notifications, file attachments, integration with real HR or IT systems, working-hours calendars, and support for more than one company.

## 3. User roles
| Role | Can do |
|---|---|
| Employee | Create requests, view their own requests, add comments, cancel their own open requests |
| Agent | View and work on requests for their own team, change status, comment |
| Admin | Everything above, plus view all requests, manage users and teams, read the dashboard and the audit log |

## 4. Functional requirements
- Employees raise a request with a title, description, category (IT, HR or FACILITIES) and priority.
- A request is routed to the team for its category.
- Each priority has an SLA, and the request gets a due date when it is created.
- Agents move requests through OPEN, IN_PROGRESS, RESOLVED and CLOSED.
- Requests that pass their due date are flagged as SLA breached.
- A dashboard shows requests by status and by category, and how many breached their SLA.
- Every important action is written to the audit log.

## 5. Acceptance criteria (must be testable)
1. An employee can only see their own requests (another employee's request returns 403).
2. A request is assigned to the team that matches its category.
3. A request cannot jump to an invalid status (for example OPEN straight to CLOSED).
4. A request past its due date is flagged as breached.
5. Every status change creates an audit record.
6. Only admins can read the dashboard and the audit log.

## 6. Success metrics
- 100% of new requests receive a due date based on their priority at creation.
- The number of breached requests on the dashboard equals the number of requests past their due date in the database.
- 100% of status changes are recorded in the audit log.

## 7. Assumptions and limitations
- SLA deadlines are measured in calendar hours, not working hours: URGENT 4 hours, HIGH 8 hours, MEDIUM 24 hours, LOW 72 hours.
- There is one team per category, and each agent belongs to one team.
- A request counts as breached if it was resolved after its due date, or if it is still unresolved and past its due date.
- Anyone who registers becomes an Employee; Agent and Admin accounts are created by an Admin.
- Employees can cancel their own request while it is OPEN; a RESOLVED request can be reopened to IN_PROGRESS or closed.
- Priority and category cannot be changed after a request is created.