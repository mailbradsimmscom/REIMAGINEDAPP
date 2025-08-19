import test from 'node:test';
import assert from 'node:assert/strict';
import { expandTokens } from './queryExpansion.js';

test('expandTokens merges and normalizes tokens', () => {
  const userTokens = ['hello', 'ModelX'];
  const assetMatches = [{
    model_key: 'AC-100',
    model: 'Super Phone',
    manufacturer: 'MegaCorp',
    enrich_spec_keywords: ['Battery', 'AC-100']
  }];
  const playbookMatches = [{
    triggers: ['Replace battery'],
    matchers: ['super phone']
  }];

  const tokens = expandTokens(userTokens, assetMatches, playbookMatches);
  assert.deepStrictEqual(
    new Set(tokens),
    new Set(['modelx', 'ac', '100', 'super', 'phone', 'megacorp', 'battery', 'replace'])
  );
});
