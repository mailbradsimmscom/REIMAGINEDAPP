require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { requestId } = require('./src/middleware/requestId');
const { errorHandler, notFound } = require('./src/middleware/error');
const routes = require('./src/routes');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(requestId);
app.use(morgan('combined'));

app.get('/ready', (_req, res) => res.json({ ok: true, ready: true, time: new Date().toISOString() }));

app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/', routes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
