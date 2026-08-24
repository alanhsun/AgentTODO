const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const taskRoutes = require('./routes/tasks');
const subtasksNotesRoutes = require('./routes/subtasks-notes');
const attachmentRoutes = require('./routes/attachments');
const tagRoutes = require('./routes/tags');
const webhookRoutes = require('./routes/webhooks');
const backupRoutes = require('./routes/backup');
const { createAuthenticationMiddleware } = require('./middleware/authentication');

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
if (config.corsOrigins.length > 0) {
  const allowAnyOrigin = config.corsOrigins.includes('*');
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowAnyOrigin || config.corsOrigins.includes(origin)) return callback(null, true);
      const error = new Error('Origin is not allowed by CORS');
      error.status = 403;
      return callback(error);
    },
  }));
}
app.use(express.json({ limit: config.jsonBodyLimit }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(createAuthenticationMiddleware(config));

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

// API routes (protected when API_TOKEN is configured)
app.use('/api/tasks', taskRoutes);
app.use('/api/tasks', subtasksNotesRoutes);
app.use('/api/tasks', attachmentRoutes);
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
  const status = Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) console.error('Unhandled error:', err);
  res.status(status).json({ error: status === 403 ? err.message : 'Internal server error' });
});

module.exports = app;
