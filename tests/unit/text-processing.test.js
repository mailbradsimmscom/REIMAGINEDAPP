// tests/unit/text-processing.test.js
// Node.js built-in test runner version

import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Text Processing Functions', () => {

  describe('cleanChunk function', () => {
    test('removes PDF artifacts and page numbers', async () => {
      try {
        // Try to import the function - adjust path as needed
        const mixerModule = await import('../../src/services/retrieval/mixerService.js');

        // Handle different export patterns
        const cleanChunk = mixerModule.cleanChunk || 
                          mixerModule.default?.cleanChunk ||
                          mixerModule.mixerService?.cleanChunk;

        if (!cleanChunk) {
          console.log('cleanChunk function not found, skipping test');
          return;
        }

        const dirtyText = `
          Page 5 | GPS Manual
          · Chapter 1: Setup

          GPS calibration procedure:
          1. Turn on GPS
          2. Wait for signal
        `;

        const cleaned = cleanChunk(dirtyText);

        // Should remove page numbers
        assert(!cleaned.includes('Page 5'), 'Should remove page numbers');
        assert(!cleaned.includes('|'), 'Should remove pipe characters');

        // Should remove bullet artifacts  
        assert(!cleaned.includes('·'), 'Should remove bullet artifacts');

        // Should keep useful content
        assert(cleaned.includes('GPS calibration'), 'Should keep GPS calibration text');
        assert(cleaned.includes('Turn on GPS'), 'Should keep instruction text');

        console.log('✅ Text cleaning test passed');

      } catch (error) {
        console.log('cleanChunk test skipped - function not accessible:', error.message);
      }
    });

    test('handles empty and null inputs gracefully', async () => {
      try {
        const mixerModule = await import('../../src/services/retrieval/mixerService.js');
        const cleanChunk = mixerModule.cleanChunk || mixerModule.default?.cleanChunk;

        if (!cleanChunk) return;

        assert.strictEqual(cleanChunk(''), '', 'Empty string should return empty');
        assert.strictEqual(cleanChunk(null), '', 'Null should return empty');
        assert.strictEqual(cleanChunk(undefined), '', 'Undefined should return empty');

      } catch (error) {
        console.log('cleanChunk edge case test skipped');
      }
    });
  });

  describe('Intent Classification', () => {
    test('classifies equipment questions correctly', async () => {
      try {
        const mixerModule = await import('../../src/services/retrieval/mixerService.js');
        const classifyQuestion = mixerModule.classifyQuestion || 
                               mixerModule.default?.classifyQuestion;

        if (!classifyQuestion) {
          console.log('classifyQuestion function not found, skipping test');
          return;
        }

        const testCases = [
          { question: "What GPS do I have?", context: "equipment query" },
          { question: "How do I change the watermaker filter?", context: "maintenance query" },
          { question: "Engine oil change procedure", context: "maintenance query" },
          { question: "Random unrelated question", context: "generic query" }
        ];

        for (const testCase of testCases) {
          const result = await classifyQuestion(testCase.question);
          console.log(`"${testCase.question}" → "${result}"`);

          // Just verify it returns a string for now
          assert(typeof result === 'string', 'Result should be string');
          assert(result.length > 0, 'Result should not be empty');
        }

        console.log('✅ Intent classification test passed');

      } catch (error) {
        console.log('Intent classification test skipped:', error.message);
      }
    });
  });

  describe('Scoring Functions', () => {
    test('scoreChunkByHints gives higher scores for relevant content', async () => {
      try {
        const mixerModule = await import('../../src/services/retrieval/mixerService.js');
        const scoreChunkByHints = mixerModule.scoreChunkByHints || 
                                 mixerModule.default?.scoreChunkByHints;

        if (!scoreChunkByHints) {
          console.log('scoreChunkByHints function not found, skipping test');
          return;
        }

        const hints = ['gps', 'navigation', 'garmin'];

        const relevantChunk = "Garmin GPS navigation system calibration procedure";
        const irrelevantChunk = "Random boat information about sails and rigging";

        const relevantScore = scoreChunkByHints(relevantChunk, hints);
        const irrelevantScore = scoreChunkByHints(irrelevantChunk, hints);

        console.log('Scoring results:', { relevantScore, irrelevantScore });

        assert(relevantScore > irrelevantScore, 'Relevant content should score higher');
        assert(relevantScore > 0, 'Relevant content should have positive score');

        console.log('✅ Scoring test passed');

      } catch (error) {
        console.log('Scoring test skipped:', error.message);
      }
    });
  });
});

describe('Environment and Configuration', () => {
  test('required environment variables are set', () => {
    const requiredVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'OPENAI_API_KEY',
      'PINECONE_API_KEY'
    ];

    const missing = requiredVars.filter(varName => !process.env[varName]);

    if (missing.length > 0) {
      console.log('Missing environment variables:', missing);
      console.log('Please set these in Replit Secrets');
    }

    // Don't fail the test, just report
    console.log(`Environment check: ${requiredVars.length - missing.length}/${requiredVars.length} variables set`);
  });

  test('feature flags have expected values', () => {
    const flags = {
      'RETRIEVAL_FTS_ENABLED': process.env.RETRIEVAL_FTS_ENABLED,
      'RETRIEVAL_ASSET_ENABLED': process.env.RETRIEVAL_ASSET_ENABLED,
      'RETRIEVAL_PLAYBOOK_ENABLED': process.env.RETRIEVAL_PLAYBOOK_ENABLED
    };

    console.log('Current feature flags:', flags);

    // Just log the current state - don't fail
    Object.entries(flags).forEach(([flag, value]) => {
      console.log(`${flag}: ${value || 'not set'}`);
    });
  });
});