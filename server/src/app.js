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

// Middleware
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Swagger UI & OpenAPI spec
if (swaggerDocument) {
  const swaggerUi = require('swagger-ui-express');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Task Tracker API Docs',
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

// Serve static files in production
const clientBuildPath = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientBuildPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
    if (err) {
      res.status(404).json({ error: 'Not found' });
    }
  });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
