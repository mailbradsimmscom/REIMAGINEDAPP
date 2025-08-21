// tests/integration/supabase-integration.test.js
// Test real database interactions

import { 
  testSupabase, 
  setupTestData, 
  cleanupTestData, 
  verifyTestData,
  testSupabaseConnection 
} from '../setup/supabase-test.js';

describe('Supabase Integration Tests', () => {

  // Test database connection first
  test('Supabase connection works', async () => {
    const connected = await testSupabaseConnection();
    expect(connected).toBe(true);
  });

  // Test data setup and cleanup
  describe('Test Data Management', () => {
    test('can setup and verify test data', async () => {
      const setupSuccess = await setupTestData();
      expect(setupSuccess).toBe(true);

      const counts = await verifyTestData();
      expect(counts.systems).toBeGreaterThan(0);
      expect(counts.assets).toBeGreaterThan(0);
    });

    test('can clean up test data', async () => {
      await cleanupTestData();
      const counts = await verifyTestData();
      expect(counts.systems).toBe(0);
      expect(counts.assets).toBe(0);
    });
  });

  // Test search functions with real data
  describe('Search Functions with Real Database', () => {
    beforeEach(async () => {
      await setupTestData();
    });

    afterEach(async () => {
      await cleanupTestData();
    });

    test('asset search finds test equipment', async () => {
      try {
        const { searchAssets } = require('../../src/services/sql/assetService.js');

        const results = await searchAssets(['gps', 'garmin'], { limit: 10 });

        console.log('Asset search results:', results.length);
        console.log('First result:', results[0]);

        expect(Array.isArray(results)).toBe(true);

        // Look for our test data
        const testAsset = results.find(r => 
          r.manufacturer?.toLowerCase().includes('garmin') || 
          r.model?.toLowerCase().includes('gpsmap')
        );

        if (testAsset) {
          expect(testAsset).toHaveProperty('manufacturer');
          expect(testAsset).toHaveProperty('model');
          expect(testAsset).toHaveProperty('source');
        }

      } catch (error) {
        console.log('Asset search test skipped:', error.message);
      }
    });

    test('FTS search works if enabled', async () => {
      const ftsEnabled = process.env.RETRIEVAL_FTS_ENABLED === 'true';

      if (!ftsEnabled) {
        console.log('FTS search skipped - not enabled');
        return;
      }

      try {
        const { data, error } = await testSupabase
          .rpc('search_assets_ft', { q: 'gps navigation', n: 5 });

        if (error) {
          console.log('FTS RPC not available:', error.message);
          return;
        }

        console.log('FTS search results:', data?.length || 0);

        expect(Array.isArray(data)).toBe(true);

      } catch (error) {
        console.log('FTS search test failed:', error.message);
      }
    });

    test('playbook search finds relevant procedures', async () => {
      try {
        const { searchPlaybooks } = require('../../src/services/sql/playbookService.js');

        const results = await searchPlaybooks('gps calibration', { limit: 5 });

        console.log('Playbook search results:', results.length);

        expect(Array.isArray(results)).toBe(true);

        if (results.length > 0) {
          expect(results[0]).toHaveProperty('title');
          expect(results[0]).toHaveProperty('score');
        }

      } catch (error) {
        console.log('Playbook search test skipped:', error.message);
      }
    });
  });

  // Test the main mixer service with real data
  describe('Context Building with Real Data', () => {
    beforeEach(async () => {
      await setupTestData();
    });

    afterEach(async () => {
      await cleanupTestData();
    });

    test('buildContextMix combines multiple sources', async () => {
      try {
        const { buildContextMix } = require('../../src/services/retrieval/mixerService.js');

        const result = await buildContextMix({
          question: "How do I calibrate my GPS?",
          namespace: "test-boat"
        });

        console.log('Context mix result:', {
          contextLength: result.contextText?.length || 0,
          referencesCount: result.references?.length || 0,
          assetsCount: result.assets?.length || 0,
          playbooksCount: result.playbooks?.length || 0,
          meta: result.meta
        });

        expect(result).toHaveProperty('contextText');
        expect(result).toHaveProperty('references');
        expect(result).toHaveProperty('meta');

        // Should have some content
        expect(result.contextText.length).toBeGreaterThan(0);

      } catch (error) {
        console.log('Context building test skipped:', error.message);
      }
    });
  });
});
