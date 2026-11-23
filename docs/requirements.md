# Requirements: Employee Service Request System

## 1. Business context
- **Simulated company:** [e.g. a mid-sized company with about 300 employees]
- **Primary stakeholder:** [e.g. the head of shared services]
- **Problem:** [one or two sentences: how are requests handled today, and what goes wrong?]
- **Decision the system supports:** [e.g. where to add staff, and which requests are at risk of missing their deadline]

## 2. Scope
- **In scope:** requests for IT, HR and facilities; routing to the right team; status tracking; SLA deadlines; comments; dashboards; audit log.
- **Out of scope:** [e.g. email notifications, file attachments, integration with real HR systems]

## 3. User roles
| Role | Can do |
|---|---|
| Employee | Create requests, view their own requests, add comments, cancel their own open requests |
| Agent | View and work on requests for their team, change status, comment |
| Admin | Everything above, plus view all requests, manage users and teams, view the audit log and the dashboard |

## 4. Functional requirements
- Employees raise a request with a title, description, category (IT, HR or FACILITIES) and priority.
- A request is routed to the team for its category.
- Each priority has an SLA: the request gets a due date when it is created.
- Agents move requests through OPEN, IN_PROGRESS, RESOLVED and CLOSED.
- Requests past their due date are flagged as SLA breached.
- A dashboard shows requests by status, by category, and how many breached their SLA.
- Every important action is written to the audit log.

## 5. Acceptance criteria (must be testable)
1. An employee can only see their own requests (another employee's request returns 403).
2. A request is assigned to the team that matches its category.
3. A request cannot jump to an invalid status (for example OPEN straight to CLOSED).
4. A request past its due date is flagged as breached.
5. Every status change creates an audit record.
6. Only admins can read the dashboard and the audit log.

## 6. Success metrics
- [e.g. 100% of requests get a due date at creation]
- [e.g. the dashboard shows the breach count that matches the data]

## 7. Assumptions and limitations
- [e.g. SLA is measured in calendar hours, not working hours]
- [e.g. one team per category]