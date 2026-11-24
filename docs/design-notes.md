# Design Notes

## How is a request routed to a team?
Each category (IT, HR, FACILITIES) has exactly one team. When a request is created, the API looks up the team for the chosen category and stores its id in `requests.team_id`. Agents belong to one team and only see that team's requests.

## Why are SLA hours stored in a table?
The hours for each priority (URGENT 4, HIGH 8, MEDIUM 24, LOW 72) live in `sla_policies`, so they can be changed without changing code. `due_at` is calculated once, when the request is created, and stored. Changing a policy later does not change the deadlines of existing requests.

## How is an SLA breach decided?
A request is breached if it was resolved after its due date, or if it is still unresolved and the due date has passed. Cancelled requests are never breached. The flag is calculated every time a request is read, so it stays correct as time passes without a background job.

## Why is the status flow restricted?
A request moves OPEN, IN_PROGRESS, RESOLVED, CLOSED. A RESOLVED request can be reopened to IN_PROGRESS. Cancelling is a separate action allowed only while a request is OPEN. Restricting the flow stops requests from jumping to an invalid state, which would break the audit trail and the SLA figures.

## Why does every change run in a transaction with a row lock?
Each status change or comment reads the request, checks the rules and writes the change plus an audit entry. The request row is locked (`FOR UPDATE`) while this happens, so two agents cannot change the same request at the same moment and leave it in an inconsistent state. If any step fails, the whole change is rolled back.

## Who can see what?
The user's id, role and team always come from the login token, never from the request body. Employees see only their own requests, agents see their team's requests, and admins see everything. Anyone who registers becomes an Employee, and Agent and Admin accounts are set up in the database.