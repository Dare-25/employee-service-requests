# Test Evidence

Tests were run on 2026-11-23 and 2026-11-24 against the local API (Express on http://localhost:3000, PostgreSQL 16 in Docker on port 5433), using PowerShell `Invoke-RestMethod`. Test accounts: two employees (Alice, Bob), one IT agent and one admin.

## 1. Requests: creation and routing
| Check | Expected | Result |
|---|---|---|
| Alice (employee) creates an IT request with priority HIGH | 201, status OPEN, team_id 1 (IT Support), due_at 8 hours after created_at | Pass |
| Bob (another employee) opens Alice's request | 403 Forbidden (criterion 1) | Pass |
| Alice opens her own request | 200, status OPEN, sla_breached False, no comments | Pass |
| Bob (employee with no requests) lists requests | Empty list | Pass |
| IT agent lists requests | Sees request 1 (IT team) | Pass |
| Admin lists requests | Sees request 1 | Pass |
| Alice creates an HR request with priority URGENT | 201, team_id 2 (Human Resources), due_at 4 hours after created_at (criterion 2) | Pass |
| Alice creates a FACILITIES request with priority LOW | 201, team_id 3 (Facilities), due_at 72 hours after created_at | Pass |
| Alice creates a request with a too-short title, an unknown category and an unknown priority | 400 "Validation failed" with a list of problems | Pass |
| An agent tries to create a request | 403 Forbidden | Pass |

## 2. Status flow
| Check | Expected | Result |
|---|---|---|
| Alice (employee) changes a request's status | 403 Forbidden | Pass |
| Agent changes OPEN straight to RESOLVED | 409 "Cannot change status from OPEN to RESOLVED" (criterion 3) | Pass |
| IT agent changes OPEN to IN_PROGRESS | Status IN_PROGRESS, agent set as assignee | Pass |
| IT agent changes IN_PROGRESS to RESOLVED | Status RESOLVED, resolved_at set | Pass |
| Request resolved before its due date | sla_breached False | Pass |
| IT agent changes RESOLVED to CLOSED | Status CLOSED | Pass |
| Agent tries to move a CLOSED request back to IN_PROGRESS | 409 "Cannot change status from CLOSED to IN_PROGRESS" | Pass |

## 3. Audit log and admin access
| Check | Expected | Result |
|---|---|---|
| Admin reads the audit log after request 1's life cycle | REQUEST_CREATED by Alice, then REQUEST_STATUS_IN_PROGRESS, RESOLVED and CLOSED by the IT agent (criterion 5) | Pass |
| Alice (employee) reads the audit log | 403 Forbidden (criterion 6) | Pass |
| Admin reads the dashboard with one closed IT request | total 1, active 0, sla_breached 0, counts by status, category and team match | Pass |
| Alice (employee) reads the dashboard | 403 Forbidden (criterion 6) | Pass |
| Admin reads the dashboard with one closed IT request and one overdue open HR request | total 2, active 1, sla_breached 1 | Pass |
| Admin reads the audit log after a comment and a cancellation | COMMENT_ADDED and REQUEST_STATUS_CANCELLED recorded with Alice as actor | Pass |

## 4. SLA breach
The deadline of request 2 was moved one hour into the past directly in the database (`UPDATE requests SET due_at = NOW() - interval '1 hour'`) to simulate time passing, since waiting for a real deadline was not practical.

| Check | Expected | Result |
|---|---|---|
| Open request 2 after its deadline has passed | sla_breached True (criterion 4) | Pass |

## 5. Team isolation
| Check | Expected | Result |
|---|---|---|
| IT agent opens an HR request | 403 Forbidden | Pass |
| IT agent lists requests | Only the IT request (id 1) is shown | Pass |

## 6. Comments
| Check | Expected | Result |
|---|---|---|
| Alice comments on her own open request | 201, comment returned | Pass |
| Bob (another employee) comments on Alice's request | 403 Forbidden | Pass |
| Alice sends an empty comment | 400 "body must be 1 to 2000 characters" | Pass |
| Alice comments on a CLOSED request | 409 "Cannot comment on a CLOSED request" | Pass |

## 7. Cancelling requests
| Check | Expected | Result |
|---|---|---|
| Bob (another employee) cancels Alice's request | 403 Forbidden | Pass |
| Alice cancels her own OPEN request | Status CANCELLED | Pass |
| Alice cancels the same request again | 409 "Cannot cancel a request that is CANCELLED" | Pass |
| Admin tries to move a CANCELLED request to IN_PROGRESS | 409 "Cannot change status from CANCELLED to IN_PROGRESS" | Pass |

## 8. Invalid input
| Check | Expected | Result |
|---|---|---|
| Admin opens an unknown request id (9999) | 404 "Request not found" | Pass |
| Admin opens a non-numeric request id (abc) | 400 "Invalid request id" | Pass |
| Agent sends an invalid status value (FLYING) | 400 "Invalid status" | Pass |