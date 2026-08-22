/**
 * Prompt #249B / #249C — staff/browser resumable thumbnail backfill.
 * Fetches authorized originals, generates thumbs client-side, uploads via /api/news/thumb.
 * Never deletes. Isolated per-item errors. Stops after consecutive systemic failures.
 * Dry-run is GET-only. Page load must not call write paths.
 */
(function (global) {
  var STORAGE_KEY = 'lanternThumbnailBackfillProgressV1';

  function apiBase() {
    if (typeof global.LANTERN_AVATAR_API === 'string') return global.LANTERN_AVATAR_API;
    return '';
  }

  function loadProgress() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && parsed.results && typeof parsed.results === 'object' ? parsed.results : {};
    } catch (_) {
      return {};
    }
  }

  function saveProgress(results) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify({ results: results, updatedAt: new Date().toISOString() }));
      }
    } catch (_) {}
  }

  function clearProgress() {
    try {
      if (global.localStorage) global.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  function itemKey(item) {
    return String(item.source_kind || '') + ':' + String(item.source_id || '');
  }

  function recognizeExisting(item) {
    return fetch(apiBase() + '/api/news/thumbs/recognize', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_kind: item.source_kind,
        source_id: item.source_id,
        image_version: item.image_version,
      }),
    }).then(function (r) {
      return r.json().catch(function () {
        return null;
      });
    });
  }

  function backfillOneItem(item, hooks) {
    hooks = hooks || {};
    var gen = hooks.generateThumbnailFromUrl || (global.LanternThumbnail && global.LanternThumbnail.generateThumbnailFromImageUrl);
    var upload = hooks.uploadThumbnail || function (it, thumb) {
      return global.LanternThumbnail.uploadBestEffort({
        source_kind: it.source_kind,
        source_id: it.source_id,
        original_object_key: it.original_object_key,
        image_version: it.image_version,
        blob: thumb.blob,
      });
    };
    var recognize = hooks.recognizeExistingThumbnail || recognizeExisting;
    if (!item || !item.source_id) {
      return Promise.resolve({ status: 'skipped', reason: 'invalid-item' });
    }
    return recognize(item)
      .then(function (recognized) {
        if (recognized && recognized.ok) {
          return { status: 'completed', mode: 'recognized', item: item, sizeBytes: recognized.size_bytes };
        }
        if (!gen) return { status: 'failed', item: item, error: 'generator_unavailable' };
        return gen(item.file_url).then(function (thumb) {
          return upload(item, thumb).then(function (data) {
            if (data && data.ok) {
              return { status: 'completed', mode: 'generated', item: item, sizeBytes: (data.body && data.body.size_bytes) || thumb.size };
            }
            return { status: 'failed', item: item, error: (data && data.error) || 'upload_failed' };
          });
        });
      })
      .catch(function (err) {
        return { status: 'failed', item: item, error: err && err.message ? err.message : String(err) };
      });
  }

  function listCandidates(opts) {
    opts = opts || {};
    var q = new URLSearchParams();
    if (opts.dryRun) q.set('dry_run', '1');
    if (opts.maxItems) q.set('max_items', String(opts.maxItems));
    if (opts.sourceKind) q.set('source_kind', opts.sourceKind);
    if (opts.sourceId) q.set('source_id', opts.sourceId);
    if (opts.cursor) q.set('cursor', opts.cursor);
    return fetch(apiBase() + '/api/news/thumbs/candidates?' + q.toString(), { credentials: 'include' }).then(function (r) {
      return r.json().then(function (body) {
        if (!body || typeof body !== 'object') {
          return { ok: false, error: 'invalid_json', httpStatus: r.status };
        }
        if (!body.httpStatus) body.httpStatus = r.status;
        return body;
      }).catch(function () {
        return { ok: false, error: 'invalid_json', httpStatus: r.status };
      });
    });
  }

  function summarizeCandidates(items) {
    var list = items || [];
    var kinds = {};
    var already = 0;
    var sidecar = 0;
    list.forEach(function (it) {
      var k = String((it && it.source_kind) || 'unknown');
      kinds[k] = (kinds[k] || 0) + 1;
      if (it && it.has_thumbnail) already += 1;
      if (it && it.has_sidecar) sidecar += 1;
    });
    return {
      count: list.length,
      already_thumbnailed: already,
      skipped: already,
      sidecar_present: sidecar,
      source_kinds: kinds,
    };
  }

  function formatDryRunReport(payload, opts) {
    opts = opts || {};
    var items = (payload && payload.candidates) || [];
    var summary = summarizeCandidates(items);
    var kindLine = Object.keys(summary.source_kinds)
      .sort()
      .map(function (k) {
        return k + '=' + summary.source_kinds[k];
      })
      .join(', ');
    if (!kindLine) kindLine = 'none';
    var err = payload && payload.error ? String(payload.error) : '';
    var lines = [
      'DRY RUN — READ ONLY',
      'NO D1 WRITES',
      'NO R2 WRITES',
      'Candidates found: ' + summary.count,
      'Already thumbnailed / skipped: ' + summary.already_thumbnailed,
      'Sidecar present: ' + summary.sidecar_present,
      'Source kinds: ' + kindLine,
      'Max items applied: ' + (opts.maxItems == null || opts.maxItems === '' ? '(default)' : String(opts.maxItems)),
      'Errors: ' + (err || 'none'),
    ];
    if (items.length) {
      lines.push('');
      lines.push('Candidates:');
      items.forEach(function (it) {
        lines.push(
          '- ' +
            String(it.source_kind || '?') +
            ' / ' +
            String(it.source_id || '?') +
            (it.has_thumbnail ? ' (already thumbnailed)' : '')
        );
      });
    }
    return lines.join('\n');
  }

  function runBackfillBatch(options) {
    var opts = options || {};
    var maxConsecutiveFailures = opts.maxConsecutiveFailures || 3;
    var concurrency = Math.min(3, Math.max(1, parseInt(opts.concurrency || '1', 10) || 1));
    var results = loadProgress();
    var completed = 0;
    var failed = 0;
    var skipped = 0;
    var recognized = 0;
    var generated = 0;
    var failedIds = [];
    var consecutiveFailures = 0;
    var stopped = false;

    return listCandidates(opts).then(function (payload) {
      if (!payload || !payload.ok) {
        return { ok: false, error: (payload && payload.error) || 'candidates_unavailable', dry_run: !!opts.dryRun };
      }
      var items = payload.candidates || [];
      if (opts.dryRun) {
        var summary = summarizeCandidates(items);
        return {
          ok: true,
          dry_run: true,
          writes: 'none',
          d1_writes: 0,
          r2_writes: 0,
          count: summary.count,
          already_thumbnailed: summary.already_thumbnailed,
          skipped: summary.skipped,
          sidecar_present: summary.sidecar_present,
          source_kinds: summary.source_kinds,
          max_items: opts.maxItems || null,
          candidates: items,
          completed: 0,
          failed: 0,
        };
      }
      var remaining = items.filter(function (item) {
        var st = results[itemKey(item)];
        return st !== 'completed' && st !== 'skipped';
      });

      function processIndex(index) {
        if (stopped || index >= remaining.length) {
          saveProgress(results);
          return Promise.resolve({
            ok: true,
            dry_run: false,
            completed: completed,
            failed: failed,
            skipped: skipped,
            recognized: recognized,
            generated: generated,
            failedIds: failedIds,
            stopped: stopped,
            remaining: Math.max(0, remaining.length - index),
          });
        }
        var item = remaining[index];
        return backfillOneItem(item, opts.hooks).then(function (result) {
          if (result.status === 'completed') {
            results[itemKey(item)] = 'completed';
            completed += 1;
            consecutiveFailures = 0;
            if (result.mode === 'recognized') recognized += 1;
            else generated += 1;
          } else if (result.status === 'failed') {
            results[itemKey(item)] = 'failed';
            failed += 1;
            failedIds.push({ id: itemKey(item), reason: result.error });
            consecutiveFailures += 1;
          } else {
            results[itemKey(item)] = 'skipped';
            skipped += 1;
          }
          saveProgress(results);
          if (consecutiveFailures >= maxConsecutiveFailures) stopped = true;
          return processIndex(index + 1);
        });
      }

      void concurrency;
      return processIndex(0);
    });
  }

  global.LanternThumbnailBackfill = {
    listCandidates: listCandidates,
    backfillOneItem: backfillOneItem,
    runBackfillBatch: runBackfillBatch,
    formatDryRunReport: formatDryRunReport,
    summarizeCandidates: summarizeCandidates,
    loadProgress: loadProgress,
    clearProgress: clearProgress,
  };
})(typeof window !== 'undefined' ? window : globalThis);
