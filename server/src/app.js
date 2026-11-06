const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const taskRoutes = require('./routes/tasks');
const subtasksNotesRoutes = require('./routes/subtasks-notes');
const tagRoutes = require('./routes/tags');
const webhookRoutes = require('./routes/webhooks');
const backupRoutes = require('./routes/backup');
const { subscribeEvents } = require('./services/eventService');

// Load OpenAPI spec
let swaggerDocument = null;
try {
  const yaml = require('js-yaml');
  const specPath = path.join(__dirname, '..', '..', 'docs', 'openapi.yaml');
  if (fs.existsSync(specPath)) {
    swaggerDocument = yaml.load(fs.readFileSync(specPath, 'utf8'));
  }
} catch (e) {
  console.warn('Swagger docs not available:', e.message);
}

const app = express();
app.disable('x-powered-by');

// Middleware
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: config.jsonLimit }));

// Health check & SSE real-time stream
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/api/events', subscribeEvents);

// Swagger UI & OpenAPI spec
if (swaggerDocument) {
  const swaggerUi = require('swagger-ui-express');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'AgentTODO API Docs',
  }));
  app.get('/api/openapi.json', (req, res) => {
    res.json(swaggerDocument);
  });
}

// API routes (no auth required)
app.use('/api/tasks', taskRoutes);
app.use('/api/tasks', subtasksNotesRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/backup', backupRoutes);

// Unknown API routes → JSON 404 (instead of Express' default HTML page)
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});

// Serve static files in production
const clientBuildPath = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientBuildPath, {
  index: false,
  setHeaders: (res, filePath) => {
    // Vite 产物带内容哈希，可长期缓存；其余文件（如 index.html）每次校验
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'Frontend not built. Run `npm run build:client`.' });
    }
  });
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: `Request body too large (limit ${config.jsonLimit})` });
  }
  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json(err.errors ? { errors: err.errors } : { error: err.message });
  }
  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
