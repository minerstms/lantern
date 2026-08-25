/**
 * Prompt #257C — Writing Quality settings + evaluator smoke tests.
 */
import {
  WRITING_QUALITY_DEFAULTS,
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
              if (!isSelect) return null;
              if (!store.has(key)) return null;
              const row = store.get(key);
              return { value: row.value, updated_at: row.updated_at, updated_by: row.updated_by };
            },
            async run() {
              if (isUpsert) {
                store.set(key, { value, updated_at: updatedAt, updated_by: updatedBy });
              }
            },
          };
        },
      };
    },
    _store: store,
  };
}

async function testDefaults() {
  const merged = mergeWritingQualitySettings(null);
  assert(merged.enabled === true, 'enabled default on');
  assert(merged.block_paste === true, 'block paste default on');
  assert(merged.categories.spelling === true, 'spelling category on');
  assert(merged.quality_floor.repeated_char_threshold === 5, 'char threshold default');
}

async function testPatchValidation() {
  const bad = validateWritingQualityPatch({});
  assert(!bad.ok, 'reject empty patch');
  const good = validateWritingQualityPatch({ settings: { enabled: false, block_paste: false } });
  assert(good.ok && good.value.enabled === false, 'accept partial patch');
}

async function testPersistRoundTrip() {
  const db = mockDb();
  const saved = await setWritingQualitySettings(db, { enabled: false, categories: { spelling: false } }, 'admin@test');
  assert(saved.settings.enabled === false, 'saved enabled false');
  assert(saved.settings.categories.spelling === false, 'saved spelling off');
  const loaded = await getWritingQualitySettings(db);
  assert(loaded.source === 'stored', 'stored source');
  assert(loaded.settings.enabled === false, 'loaded enabled false');
}

async function testMalformedStoredJson() {
  const db = mockDb({
    'writing_quality.settings': { value: '{not json', updated_at: 't', updated_by: 'x' },
  });
  const loaded = await getWritingQualitySettings(db);
  assert(loaded.settings.enabled === WRITING_QUALITY_DEFAULTS.enabled, 'fallback on bad json');
}

console.log('writing-quality-257c-test: start');
await testDefaults();
await testPatchValidation();
await testPersistRoundTrip();
await testMalformedStoredJson();
console.log('writing-quality-257c-test: PASS (4 tests)');
