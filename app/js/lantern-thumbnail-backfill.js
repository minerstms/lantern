/**
 * Prompt #249B / #249C — staff/browser resumable thumbnail backfill.
 * Fetches authorized originals, generates thumbs client-side, uploads via /api/news/thumb.
 * Never deletes. Isolated per-item errors. Stops after consecutive systemic failures.
 * Dry-run is GET-only. Page load must not call write paths.
 */
(function (global) {
  var STORAGE_KEY = 'lanternThumbnailBackfillProgressV1';
  var HARD_MAX_BATCH_ITEMS = 25;
  var VERSION_CHANGED_HINT = 'Source version updated — run Dry Run again.';

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
    if (opts.recover || (!opts.dryRun && opts.sourceId)) q.set('recover', '1');
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

  function parseBoundedMaxItems(raw) {
    if (raw == null || String(raw).trim() === '') return { ok: false, error: 'max_items_invalid' };
    var text = String(raw).trim();
    if (!/^\d+$/.test(text)) return { ok: false, error: 'max_items_invalid', requested: raw };
    var n = parseInt(text, 10);
    if (!isFinite(n) || n < 1) return { ok: false, error: 'max_items_invalid', requested: n };
    if (n > HARD_MAX_BATCH_ITEMS) {
      return { ok: false, error: 'max_items_too_large', requested: n, max: HARD_MAX_BATCH_ITEMS };
    }
    return { ok: true, value: n };
  }

  function inputFingerprint(opts) {
    opts = opts || {};
    return [String(opts.maxItems || '').trim(), String(opts.sourceKind || '').trim(), String(opts.sourceId || '').trim()].join('\n');
  }

  function formatBatchConfirmCopy(opts) {
    opts = opts || {};
    var parsed = parseBoundedMaxItems(opts.maxItems);
    var n = parsed.ok ? parsed.value : String(opts.maxItems || '?');
    var kind = String(opts.sourceKind || '').trim();
    var id = String(opts.sourceId || '').trim();
    if (kind && id) return 'Generate thumbnails for up to ' + n + ' ' + kind + ' item (' + id + ')?';
    if (kind) return 'Generate thumbnails for up to ' + n + ' ' + kind + ' items?';
    return 'Generate thumbnails for up to ' + n + ' items?';
  }

  function formatBatchProgress(p) {
    p = p || {};
    var item = p.item || {};
    var lines = [
      'Processing ' + (p.index || 0) + ' of ' + (p.total || 0),
      'Current: ' + String(item.source_kind || '—') + ' / ' + String(item.source_id || '—'),
      'Generated: ' + (p.generated || 0),
      'Recognized: ' + (p.recognized || 0),
      'Skipped: ' + (p.skipped || 0),
      'Failed: ' + (p.failed || 0),
    ];
    if (p.stopped) lines.push('BATCH STOPPED — REVIEW ERRORS BEFORE CONTINUING');
    return lines.join('\n');
  }

  function summarizeCandidates(items) {
    var list = items || [];
    var kinds = {};
    var already = 0;
    var sidecar = 0;
    var pending = 0;
    list.forEach(function (it) {
      var k = String((it && it.source_kind) || 'unknown');
      kinds[k] = (kinds[k] || 0) + 1;
      if (it && it.has_thumbnail) already += 1;
      if (it && it.has_sidecar) sidecar += 1;
      if (it && it.has_sidecar && !it.has_thumbnail) pending += 1;
    });
    return {
      count: list.length,
      already_thumbnailed: already,
      skipped: already,
      sidecar_present: sidecar,
      sidecar_pending_thumbnail: pending,
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
      'Sidecar pending thumbnail: ' + summary.sidecar_pending_thumbnail,
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
    var parsedMax = opts.maxItems == null || opts.maxItems === '' ? null : parseBoundedMaxItems(opts.maxItems);
    if (parsedMax && !parsedMax.ok) {
      return Promise.resolve({
        ok: false,
        error: parsedMax.error,
        requested: parsedMax.requested,
        max: parsedMax.max || HARD_MAX_BATCH_ITEMS,
        dry_run: !!opts.dryRun,
      });
    }
    var boundedMax = parsedMax && parsedMax.ok ? parsedMax.value : null;
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
      if (boundedMax != null && items.length > boundedMax) items = items.slice(0, boundedMax);
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
          sidecar_pending_thumbnail: summary.sidecar_pending_thumbnail,
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
          var versionChanged = failedIds.some(function (f) {
            return f && f.reason === 'image_version_changed';
          });
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
            operator_hint: versionChanged ? VERSION_CHANGED_HINT : undefined,
          });
        }
        var item = remaining[index];
        if (typeof opts.onProgress === 'function') {
          try {
            opts.onProgress({
              phase: 'item',
              index: index + 1,
              total: remaining.length,
              item: item,
              completed: completed,
              failed: failed,
              skipped: skipped,
              recognized: recognized,
              generated: generated,
              stopped: stopped,
            });
          } catch (_) {}
        }
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
            failedIds.push({
              id: itemKey(item),
              reason: result.error,
              hint: result.error === 'image_version_changed' ? VERSION_CHANGED_HINT : undefined,
            });
            consecutiveFailures += 1;
          } else {
            results[itemKey(item)] = 'skipped';
            skipped += 1;
          }
          saveProgress(results);
          if (consecutiveFailures >= maxConsecutiveFailures) stopped = true;
          if (typeof opts.onProgress === 'function') {
            try {
              opts.onProgress({
                phase: 'after',
                index: index + 1,
                total: remaining.length,
                item: item,
                completed: completed,
                failed: failed,
                skipped: skipped,
                recognized: recognized,
                generated: generated,
                stopped: stopped,
              });
            } catch (_) {}
          }
          return processIndex(index + 1);
        });
      }

      return processIndex(0);
    });
  }

  global.LanternThumbnailBackfill = {
    HARD_MAX_BATCH_ITEMS: HARD_MAX_BATCH_ITEMS,
    VERSION_CHANGED_HINT: VERSION_CHANGED_HINT,
    listCandidates: listCandidates,
    backfillOneItem: backfillOneItem,
    runBackfillBatch: runBackfillBatch,
    parseBoundedMaxItems: parseBoundedMaxItems,
    inputFingerprint: inputFingerprint,
    formatBatchConfirmCopy: formatBatchConfirmCopy,
    formatBatchProgress: formatBatchProgress,
    formatDryRunReport: formatDryRunReport,
    summarizeCandidates: summarizeCandidates,
    loadProgress: loadProgress,
    clearProgress: clearProgress,
  };
})(typeof window !== 'undefined' ? window : globalThis);
