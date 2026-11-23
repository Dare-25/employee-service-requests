const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

module.exports = pool;