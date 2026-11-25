const app = require('./app');

const PORT = 3000;
app.listen(PORT, (err) => {
  if (err) {
    console.error('Could not start the server:', err.message);
    process.exit(1);
  }
  console.log(`API running on port ${PORT}`);
});