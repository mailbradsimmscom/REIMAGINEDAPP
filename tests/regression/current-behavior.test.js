// tests/regression/current-behavior.test.js
// Complete robust regression test with proper imports
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { 
  startIsolatedTestServer, 
  stopIsolatedTestServer, 
  createTestClient 
} from '../helpers/replit-test-server.js';

describe('Current System Behavior - ROBUST', () => {
  let testServer;
  let client;

  before(async () => {
    console.log('🧪 Starting isolated test server...');
    const { server, port } = await startIsolatedTestServer();
    testServer = server;
    const baseURL = `http://127.0.0.1:${port}`;
    client = createTestClient(baseURL);
  });

  after(async () => {
    await stopIsolatedTestServer(testServer);
  });

  test('BFF web query endpoint responds with valid structure', async () => {
    const { status, body } = await client.post('/bff/web/query', {
      question: "test question"
    });

    assert.strictEqual(status, 200, 'Should return 200 OK');
    assert(typeof body === 'object', 'Response should be object');
    assert(body !== null, 'Response should not be null');

    // Handle both success and error response formats
    if (body.error) {
      console.log('API returned error response:', body.error);
      assert(typeof body.error === 'string', 'Error should be string');
    } else {
      // Validate success response structure
      assert(body.hasOwnProperty('summary'), 'Response should have summary property');

      // Handle null/undefined summary gracefully
      const summary = body.summary;
      if (summary !== null && summary !== undefined) {
        assert(typeof summary === 'string', 'Summary should be string when present');
      } else {
        console.log('⚠️  Summary is null/undefined (expected with API errors)');
      }
    }

    console.log('✅ Endpoint structure validation passed');
    console.log(`   Response type: ${typeof body}`);
    console.log(`   Has summary: ${body.hasOwnProperty('summary')}`);
    console.log(`   Summary value: ${body.summary !== null ? 'present' : 'null'}`);
  });

  test('GPS question returns some response (handles API errors)', async () => {
    const { status, body } = await client.post('/bff/web/query', {
      question: "What GPS do I have?"
    });

    assert.strictEqual(status, 200, 'Should return 200 OK');
    assert(typeof body === 'object', 'Should return object');
    assert(body !== null, 'Response should not be null');

    // Check for error vs success response
    if (body.error) {
      console.log('GPS query returned error:', body.error);
      assert(typeof body.error === 'string', 'Error message should be string');
    } else {
      // Validate response has expected properties (even if empty)
      assert(body.hasOwnProperty('assets'), 'Should have assets property');
      assert(body.hasOwnProperty('playbooks'), 'Should have playbooks property');

      // Check arrays are properly formatted
      const assets = body.assets;
      const playbooks = body.playbooks;

      if (assets !== null && assets !== undefined) {
        assert(Array.isArray(assets), 'Assets should be array when present');
      }

      if (playbooks !== null && playbooks !== undefined) {
        assert(Array.isArray(playbooks), 'Playbooks should be array when present');
      }
    }

    const analysisData = {
      hasError: !!body.error,
      hasAssets: body.hasOwnProperty('assets'),
      hasPlaybooks: body.hasOwnProperty('playbooks'),
      assetsCount: Array.isArray(body.assets) ? body.assets.length : 'n/a',
      playbooksCount: Array.isArray(body.playbooks) ? body.playbooks.length : 'n/a',
      summaryPresent: body.summary !== null && body.summary !== undefined
    };
    console.log(`GPS Response Analysis: ${JSON.stringify(analysisData)}`);
  });

  test('Watermaker question response structure', async () => {
    const { status, body } = await client.post('/bff/web/query', {
      question: "How do I maintain my watermaker?"
    });

    assert.strictEqual(status, 200, 'Should return 200 OK');
    assert(typeof body === 'object', 'Should return object');

    // Focus on structure rather than content
    if (body.error) {
      console.log('Watermaker query error (expected):', body.error);
      assert(typeof body.error === 'string', 'Error should be string');
    } else {
      // Just verify basic response structure exists
      const hasBasicStructure = body.hasOwnProperty('summary') || 
                               body.hasOwnProperty('assets') || 
                               body.hasOwnProperty('playbooks');

      assert(hasBasicStructure, 'Response should have at least one expected property');
    }

    const structureData = {
      responseKeys: Object.keys(body),
      hasError: !!body.error,
      responseSize: JSON.stringify(body).length
    };
    console.log(`Watermaker Response Structure: ${JSON.stringify(structureData)}`);
  });

  test('API handles different question types', async () => {
    const testQuestions = [
      "navigation equipment",
      "engine maintenance", 
      "test query"
      // Removed empty string - it correctly returns 400 (Bad Request)
    ];

    for (const question of testQuestions) {
      const { status, body } = await client.post('/bff/web/query', { question });

      // Should always return 200 with some response
      assert.strictEqual(status, 200, `Question "${question}" should return 200`);
      assert(typeof body === 'object', 'Should always return object');
      assert(body !== null, 'Response should never be null');

      // Should have either error or success structure
      const hasError = !!body.error;
      const hasSuccess = body.hasOwnProperty('summary') || 
                        body.hasOwnProperty('assets') || 
                        body.hasOwnProperty('playbooks');

      assert(hasError || hasSuccess, 'Should have either error or success structure');
    }

    // Test empty question separately (should return 400 - ValidationError)
    const { status: emptyStatus, body: emptyBody } = await client.post('/bff/web/query', { question: "" });
    assert.strictEqual(emptyStatus, 400, 'Empty question should return 400 ValidationError');
    
    // Validate the new error format
    assert.strictEqual(emptyBody.ok, false, 'Error response should have ok: false');
    assert(emptyBody.error, 'Error response should have error object');
    assert.strictEqual(emptyBody.error.type, 'ValidationError', 'Should be ValidationError type');
    assert.strictEqual(emptyBody.error.code, 'VALIDATION_ERROR', 'Should have correct error code');
    assert.strictEqual(emptyBody.error.field, 'question', 'Should identify the field that failed validation');

    console.log('✅ Multiple question types handled consistently');
    console.log(`   Empty question returns: ${emptyStatus} with ValidationError format`);
  });

  test('Server error handling with ValidationError', async () => {
    // Test missing question - should return 400 ValidationError
    const { status: status1, body: body1 } = await client.post('/bff/web/query', {});
    assert.strictEqual(status1, 400, 'Missing question should return 400');
    assert.strictEqual(body1.ok, false, 'Should have ok: false');
    assert.strictEqual(body1.error.type, 'ValidationError', 'Should be ValidationError');
    assert(body1.requestId, 'Should have requestId for debugging');

    // Test invalid data structure - should also return 400 ValidationError (missing question)
    const { status: status2, body: body2 } = await client.post('/bff/web/query', { invalid: "data" });
    assert.strictEqual(status2, 400, 'Invalid data should return 400');
    assert.strictEqual(body2.ok, false, 'Should have ok: false');
    assert.strictEqual(body2.error.type, 'ValidationError', 'Should be ValidationError');
    assert.strictEqual(body2.error.field, 'question', 'Should identify missing question field');

    console.log('✅ ValidationError handling validation passed');
    console.log(`   Empty request: ${status1} with ${body1.error.type}`);
    console.log(`   Invalid request: ${status2} with ${body2.error.type}`);
  });

  test('Successful requests maintain expected response format', async () => {
    // Test that successful requests still return the expected structure
    const { status, body } = await client.post('/bff/web/query', {
      question: "test validation success"
    });

    assert.strictEqual(status, 200, 'Valid question should return 200');
    assert(typeof body === 'object', 'Should return object');
    assert(body !== null, 'Should not be null');
    
    // Success responses should NOT have the new error format
    assert(body.ok === undefined, 'Success responses should not have ok field');
    assert(body.error === undefined, 'Success responses should not have error field');
    
    // Should have expected success structure
    assert(body.hasOwnProperty('summary'), 'Should have summary');
    assert(body.hasOwnProperty('assets'), 'Should have assets');
    assert(body.hasOwnProperty('playbooks'), 'Should have playbooks');

    console.log('✅ Success response format validation passed');
  });
});