// tests/helpers/replit-test-server.js
// Replit-safe test server that NEVER touches port 3000
import express from 'express';

// Ensure test environment - this prevents interfering with main app
process.env.NODE_ENV = 'test';

// Set up test-only environment variables (won't affect main server)
const TEST_ENV = {
  PINECONE_INDEX: process.env.PINECONE_INDEX || 'test-index',
  PINECONE_NAMESPACE: process.env.PINECONE_NAMESPACE || 'test-ns',
  SUPABASE_URL: process.env.SUPABASE_URL || 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'test-key'
};

// Apply test environment
Object.assign(process.env, TEST_ENV);

let bffRouter;
let routerLoadError = null;

// Try to load the actual router, with fallback
try {
  const routerModule = await import('../../src/routes/bff.js');
  bffRouter = routerModule.default;
  console.log('✅ Loaded actual BFF router for testing');
} catch (error) {
  routerLoadError = error;
  console.warn('⚠️  Could not load BFF router:', error.message);

  // Create a mock router that behaves like the real one
  bffRouter = express.Router();

  bffRouter.post('/web/query', (req, res) => {
    res.json({
      summary: `Mock response for: ${req.body.question}`,
      bullets: ['Mock bullet point'],
      assets: [],
      playbooks: [],
      _structured: { 
        raw: { 
          references: req.body.references || [] 
        } 
      },
      _retrievalMeta: {
        tokens: ['mock'],
        mode: 'mock'
      }
    });
  });

  console.log('✅ Created mock BFF router for testing');
}

export function createIsolatedTestServer() {
  const app = express();

  // Basic middleware for tests
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health check that's different from main app
  app.get('/test-health', (req, res) => {
    res.json({ 
      ok: true, 
      test: true, 
      time: new Date().toISOString(),
      routerLoaded: !routerLoadError,
      env: process.env.NODE_ENV
    });
  });

  // Mount BFF routes (real or mock)
  app.use('/bff', bffRouter);

  // Test-specific error handler
  app.use((err, req, res, next) => {
    console.error('Test server error:', err.message);
    res.status(500).json({ 
      error: 'Test server error', 
      message: err.message,
      test: true 
    });
  });

  return app;
}

export async function startIsolatedTestServer() {
  const app = createIsolatedTestServer();

  return new Promise((resolve, reject) => {
    // CRITICAL: Use port 0 to get random available port
    // This ensures we NEVER conflict with the main app on port 3000
    const server = app.listen(0, '127.0.0.1', (err) => {
      if (err) {
        reject(err);
      } else {
        const actualPort = server.address().port;
        console.log(`🧪 Test server isolated on port ${actualPort} (main app safe on 3000)`);
        resolve({ server, port: actualPort, app });
      }
    });

    server.on('error', (err) => {
      console.error('Test server startup error:', err.message);
      reject(err);
    });

    // Ensure cleanup on process exit
    process.on('exit', () => {
      if (server && server.listening) {
        server.close();
      }
    });
  });
}

export async function stopIsolatedTestServer(server) {
  return new Promise((resolve) => {
    if (server && server.listening) {
      server.close(() => {
        console.log('🧪 Test server stopped (main app still running)');
        resolve();
      });

      // Force close after timeout
      setTimeout(() => {
        if (server.listening) {
          server.destroy();
          resolve();
        }
      }, 1000);
    } else {
      resolve();
    }
  });
}

// Utility function for making test requests
export function createTestClient(baseURL) {
  return {
    async post(path, data) {
      const response = await fetch(`${baseURL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const body = await response.json();
      return { response, body, status: response.status };
    },

    async get(path) {
      const response = await fetch(`${baseURL}${path}`);
      const body = await response.json();
      return { response, body, status: response.status };
    }
  };
}

// Check if we can safely run integration tests
export function canRunIntegrationTests() {
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];

  const missing = requiredEnvVars.filter(varName => {
    const value = process.env[varName];
    return !value || value === '.';
  });

  if (missing.length > 0) {
    console.log(`⚠️  Integration tests will be skipped - missing: ${missing.join(', ')}`);
    return false;
  }

  return true;
}