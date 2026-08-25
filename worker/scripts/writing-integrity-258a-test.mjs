/**
 * Prompt #258A — evaluator + field profile unit tests.
 */
import {
  mergeWritingQualitySettings,
  validateWritingQualityPatch,
  getWritingQualitySettings,
  setWritingQualitySettings,
} from '../writing-quality-settings.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function mockDb(initial) {
  const store = new Map(Object.entries(initial || {}));
  return {
    prepare(sql) {
      const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
      const isUpsert = sql.includes('INSERT INTO lantern_settings');
      return {
        bind(key, value, updatedAt, updatedBy) {
          return {
            async first() {
              if (!isSelect || !store.has(key)) return null;
              const row = store.get(key);
              return { value: row.value, updated_at: row.updated_at, updated_by: row.updated_by };
            },
            async run() {
              if (isUpsert) store.set(key, { value, updated_at: updatedAt, updated_by: updatedBy });
            },
          };
        },
      };
    },
  };
}

async function testDefaults() {
  const merged = mergeWritingQualitySettings(null);
  assert(merged.limit_phrase_suggestions === true, 'limit phrase default on');
  assert(merged.block_paste === true, 'block paste on');
}

async function testLegacyKeyMap() {
  const merged = mergeWritingQualitySettings({ preserve_single_word_suggestions: true, limit_phrase_suggestions: undefined });
  assert(merged.limit_phrase_suggestions === true, 'legacy map');
}

async function testPersistRoundTrip() {
  const db = mockDb();
  await setWritingQualitySettings(db, { limit_phrase_suggestions: false }, 'admin@test');
  const loaded = await getWritingQualitySettings(db);
  assert(loaded.settings.limit_phrase_suggestions === false, 'stored limit phrase');
}

async function testPatchValidation() {
  const bad = validateWritingQualityPatch({});
  assert(!bad.ok, 'reject empty');
  const good = validateWritingQualityPatch({ settings: { enabled: false } });
  assert(good.ok && good.value.enabled === false, 'accept patch');
}

console.log('writing-integrity-258a-test: start');
await testDefaults();
await testLegacyKeyMap();
await testPersistRoundTrip();
await testPatchValidation();
console.log('writing-integrity-258a-test: PASS (4 tests)');
