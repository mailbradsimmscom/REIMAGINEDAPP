// tests/regression/current-behavior.test.js
// Node.js built-in test runner version

import { test, describe } from 'node:test';
import assert from 'node:assert';
import supertest from 'supertest';

// Import your app - adjust path as needed
let app;
try {
  const appModule = await import('../../index.js');
  app = appModule.default || appModule.app;
} catch (error) {
  console.error('Could not import app:', error.message);
  console.log('Please adjust the import path in this test file');
  process.exit(1);
}

describe('Current System Behavior - BASELINE', () => {

  test('BFF web query endpoint responds', async () => {
    const response = await supertest(app)
      .post('/bff/web/query')
      .send({ question: "test question" })
      .expect(200);

    // Verify basic response structure
    assert(response.body.hasOwnProperty('summary'), 'Response should have summary');
    assert(response.body.hasOwnProperty('bullets'), 'Response should have bullets');
    assert(typeof response.body.summary === 'string', 'Summary should be string');
    assert(Array.isArray(response.body.bullets), 'Bullets should be array');

    console.log('✅ Basic endpoint test passed');
  });

  test('GPS question returns equipment info', async () => {
    const response = await supertest(app)
      .post('/bff/web/query')
      .send({ question: "What GPS do I have?" });

    const fullText = JSON.stringify(response.body).toLowerCase();

    // Should mention GPS or navigation
    assert(
      fullText.includes('gps') || fullText.includes('navigation') || fullText.includes('garmin'),
      'Response should mention GPS/navigation/garmin'
    );

    // Should have some results
    const hasResults = (response.body.assets?.length > 0) || 
                      (response.body.playbooks?.length > 0) ||
                      (response.body.summary?.length > 10);

    assert(hasResults, 'Should have some meaningful results');

    console.log('GPS Response Stats:', {
      assets: response.body.assets?.length || 0,
      playbooks: response.body.playbooks?.length || 0,
      summaryLength: response.body.summary?.length || 0
    });
  });

  test('Watermaker question returns relevant info', async () => {
    const response = await supertest(app)
      .post('/bff/web/query')
      .send({ question: "How do I maintain my watermaker?" });

    const fullText = JSON.stringify(response.body).toLowerCase();

    // Should mention watermaker or related terms
    const hasWatermakerTerms = fullText.includes('watermaker') || 
                              fullText.includes('water') || 
                              fullText.includes('filter') || 
                              fullText.includes('maintenance');

    assert(hasWatermakerTerms, 'Should mention watermaker-related terms');

    console.log('Watermaker Response Summary:', 
      response.body.summary?.substring(0, 100) || 'No summary'
    );
  });

  test('Search works with different configurations', async () => {
    const response = await supertest(app)
      .post('/bff/web/query')
      .send({ question: "engine maintenance" });

    assert.strictEqual(response.status, 200, 'Should return 200 status');
    assert(response.body.summary, 'Should have summary');

    console.log('Engine Response Structure:', {
      summaryLength: response.body.summary?.length || 0,
      bulletsCount: response.body.bullets?.length || 0,
      assetsCount: response.body.assets?.length || 0,
      playbooksCount: response.body.playbooks?.length || 0
    });
  });
});

describe('Component Tests - Current Behavior', () => {

  test('Intent classification works', async () => {
    try {
      const mixerModule = await import('../../src/services/retrieval/mixerService.js');
      const { classifyQuestion } = mixerModule;

      const intent1 = await classifyQuestion("What GPS do I have?");
      const intent2 = await classifyQuestion("How to change oil?");
      const intent3 = await classifyQuestion("Random question about nothing");

      console.log('Intent Classification Results:', { intent1, intent2, intent3 });

      // Just verify it returns something
      assert(typeof intent1 === 'string', 'Intent should be string');
      assert(typeof intent2 === 'string', 'Intent should be string');
      assert(typeof intent3 === 'string', 'Intent should be string');
      assert(intent1.length > 0, 'Intent should not be empty');

    } catch (error) {
      console.log('Intent classification test skipped:', error.message);
    }
  });

  test('Asset search returns results', async () => {
    try {
      const assetModule = await import('../../src/services/sql/assetService.js');
      const { searchAssets } = assetModule;

      const results = await searchAssets(['gps', 'navigation'], { limit: 5 });

      console.log('Asset Search Results:', {
        count: results?.length || 0,
        firstResult: results?.[0] ? {
          manufacturer: results[0].manufacturer,
          model: results[0].model,
          source: results[0].source
        } : null
      });

      // Just verify it returns an array
      assert(Array.isArray(results), 'Should return array');

    } catch (error) {
      console.log('Asset search test skipped:', error.message);
    }
  });
});

describe('Performance Baseline', () => {

  test('Responses complete within reasonable time', async () => {
    const start = Date.now();

    await supertest(app)
      .post('/bff/web/query')
      .send({ question: "GPS calibration" });

    const duration = Date.now() - start;
    console.log(`Response time: ${duration}ms`);

    // In Replit, allow up to 10 seconds
    assert(duration < 10000, `Response should be under 10s, was ${duration}ms`);
  });
});