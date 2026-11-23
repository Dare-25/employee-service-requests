const pool = require('./db');

// Pass a transaction client as `db` when inside a transaction, otherwise pass pool.
async function audit(db, actorId, action, entity, entityId) {
  await (db || pool).query(
    'INSERT INTO audit_logs (actor_id, action, entity, entity_id) VALUES ($1, $2, $3, $4)',
    [actorId, action, entity, entityId]
  );
}

module.exports = audit;