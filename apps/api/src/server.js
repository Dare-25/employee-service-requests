const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json());
app.use('/auth', require('./routes/auth'));
app.use('/requests', require('./routes/requests'));
app.use('/admin', require('./routes/admin'));

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', database: 'unreachable' });
  }
});

const PORT = 3000;
app.listen(PORT, (err) => {
  if (err) {
    console.error('Could not start the server:', err.message);
    process.exit(1);
  }
  console.log(`API running on port ${PORT}`);
});