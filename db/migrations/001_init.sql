CREATE TABLE teams (
  id       SERIAL PRIMARY KEY,
  name     VARCHAR(100) NOT NULL UNIQUE,
  category VARCHAR(20)  NOT NULL UNIQUE CHECK (category IN ('IT','HR','FACILITIES'))
);

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('EMPLOYEE','AGENT','ADMIN')),
  team_id       INTEGER REFERENCES teams(id),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (role <> 'AGENT' OR team_id IS NOT NULL)
);

CREATE TABLE sla_policies (
  priority VARCHAR(10) PRIMARY KEY CHECK (priority IN ('URGENT','HIGH','MEDIUM','LOW')),
  hours    INTEGER NOT NULL CHECK (hours > 0)
);

CREATE TABLE requests (
  id           SERIAL PRIMARY KEY,
  requester_id INTEGER NOT NULL REFERENCES users(id),
  team_id      INTEGER NOT NULL REFERENCES teams(id),
  assignee_id  INTEGER REFERENCES users(id),
  title        VARCHAR(200) NOT NULL,
  description  TEXT NOT NULL,
  category     VARCHAR(20) NOT NULL CHECK (category IN ('IT','HR','FACILITIES')),
  priority     VARCHAR(10) NOT NULL REFERENCES sla_policies(priority),
  status       VARCHAR(20) NOT NULL DEFAULT 'OPEN'
               CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED','CANCELLED')),
  due_at       TIMESTAMP NOT NULL,
  resolved_at  TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_requests_requester ON requests (requester_id);
CREATE INDEX idx_requests_team_status ON requests (team_id, status);
CREATE INDEX idx_requests_due ON requests (due_at);

CREATE TABLE comments (
  id         SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id),
  author_id  INTEGER NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id         SERIAL PRIMARY KEY,
  actor_id   INTEGER NOT NULL REFERENCES users(id),
  action     VARCHAR(100) NOT NULL,
  entity     VARCHAR(50)  NOT NULL,
  entity_id  INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO teams (name, category) VALUES
  ('IT Support', 'IT'),
  ('Human Resources', 'HR'),
  ('Facilities', 'FACILITIES');

INSERT INTO sla_policies (priority, hours) VALUES
  ('URGENT', 4), ('HIGH', 8), ('MEDIUM', 24), ('LOW', 72);