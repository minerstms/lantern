/**
 * Prompt #249B — browser JPEG thumbnail generator (donor settings).
 * Long edge 480px, quality 0.72, no upscale. Best-effort; never blocks original upload.
 */
(function (global) {
  var MAX_LONG_EDGE = 480;
  var JPEG_QUALITY = 0.72;
  var MAX_INPUT_EDGE = 8192;
  var MAX_INPUT_PIXELS = 40 * 1000 * 1000;

  function scaleToLongEdge(width, height) {
    var w = Number(width) || 0;
    var h = Number(height) || 0;
    if (w < 1 || h < 1) return { width: 0, height: 0 };
    var longEdge = Math.max(w, h);
    if (longEdge <= MAX_LONG_EDGE) return { width: w, height: h };
    var scale = MAX_LONG_EDGE / longEdge;
    return {
      width: Math.max(1, Math.round(w * scale)),
      height: Math.max(1, Math.round(h * scale)),
    };
  }

  function rejectAbsurdDimensions(width, height) {
    var w = Number(width) || 0;
    var h = Number(height) || 0;
    if (w < 1 || h < 1) return new Error('Image dimensions are unavailable.');
    if (w > MAX_INPUT_EDGE || h > MAX_INPUT_EDGE) return new Error('Image dimensions are too large.');
    if (w * h > MAX_INPUT_PIXELS) return new Error('Image is too large to thumbnail.');
    return null;
  }

  function exportCanvasToJpegBlob(canvas) {
    return new Promise(function (resolve, reject) {
      if (!canvas || typeof canvas.toBlob !== 'function') {
        reject(new Error('Canvas is unavailable.'));
        return;
      }
      canvas.toBlob(
        function (blob) {
          if (!blob) {
            reject(new Error('Could not export thumbnail.'));
            return;
          }
          resolve(blob);
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    });
  }

  function drawSourceToThumbnailCanvas(source, width, height) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext('2d');
    if (!context) return Promise.reject(new Error('Canvas is unavailable.'));
    context.drawImage(source, 0, 0, width, height);
    return exportCanvasToJpegBlob(canvas).then(function (blob) {
      return { blob: blob, width: width, height: height, size: blob.size };
    });
  }

  function generateThumbnailFromImageUrl(imageUrl) {
    return new Promise(function (resolve, reject) {
      if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
        reject(new Error('Image URL is required.'));
        return;
      }
      var image = new Image();
      image.decoding = 'async';
      image.onload = function () {
        var naturalWidth = image.naturalWidth || image.width;
        var naturalHeight = image.naturalHeight || image.height;
        var absurd = rejectAbsurdDimensions(naturalWidth, naturalHeight);
        if (absurd) {
          reject(absurd);
          return;
        }
        var scaled = scaleToLongEdge(naturalWidth, naturalHeight);
        drawSourceToThumbnailCanvas(image, scaled.width, scaled.height).then(resolve, reject);
      };
      image.onerror = function () {
        reject(new Error('Could not load image for thumbnail generation.'));
      };
      image.src = imageUrl;
    });
  }

  function generateThumbnailFromBlobWithImageElement(blob) {
    return new Promise(function (resolve, reject) {
      var objectUrl = URL.createObjectURL(blob);
      var image = new Image();
      image.decoding = 'async';
      image.onload = function () {
        var absurd = rejectAbsurdDimensions(image.naturalWidth, image.naturalHeight);
        if (absurd) {
          URL.revokeObjectURL(objectUrl);
          reject(absurd);
          return;
        }
        var scaled = scaleToLongEdge(image.naturalWidth, image.naturalHeight);
        drawSourceToThumbnailCanvas(image, scaled.width, scaled.height)
          .then(resolve, reject)
          .finally(function () {
            URL.revokeObjectURL(objectUrl);
          });
      };
      image.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not decode image for thumbnail.'));
      };
      image.src = objectUrl;
    });
  }

  function generateThumbnailFromBlob(blob) {
    if (!blob) return Promise.reject(new Error('Thumbnail generation unavailable.'));
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(blob)
        .then(function (bitmap) {
          var absurd = rejectAbsurdDimensions(bitmap.width, bitmap.height);
          if (absurd) {
            if (bitmap && typeof bitmap.close === 'function') bitmap.close();
            return Promise.reject(absurd);
          }
          var scaled = scaleToLongEdge(bitmap.width, bitmap.height);
          return drawSourceToThumbnailCanvas(bitmap, scaled.width, scaled.height).finally(function () {
            if (bitmap && typeof bitmap.close === 'function') bitmap.close();
          });
        })
        .catch(function (err) {
          if (err && /too large|dimensions/i.test(String(err.message || err))) return Promise.reject(err);
          return generateThumbnailFromBlobWithImageElement(blob);
        });
    }
    return generateThumbnailFromBlobWithImageElement(blob);
  }

  function dataUrlToBlob(dataUrl) {
    return fetch(dataUrl).then(function (r) {
      return r.blob();
    });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ''));
      };
      reader.onerror = function () {
        reject(new Error('Could not read thumbnail bytes.'));
      };
      reader.readAsDataURL(blob);
    });
  }

  function apiBase() {
    if (typeof global.LANTERN_AVATAR_API === 'string') return global.LANTERN_AVATAR_API;
    return '';
  }

  function uploadBestEffort(opts) {
    opts = opts || {};
    var kind = String(opts.source_kind || '').trim();
    var id = String(opts.source_id || '').trim();
    var originalKey = String(opts.original_object_key || '').trim();
    if (!kind || !id || !originalKey) return Promise.resolve({ ok: false, skipped: true });

    function postThumb(thumb) {
      return blobToDataUrl(thumb.blob)
        .then(function (dataUrl) {
          return fetch(apiBase() + '/api/news/thumb', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source_kind: kind,
              source_id: id,
              original_object_key: originalKey,
              image_version: opts.image_version != null ? opts.image_version : 1,
              thumbnail: dataUrl,
              width: thumb.width,
              height: thumb.height,
            }),
          });
        })
        .then(function (r) {
          return r.json().catch(function () {
            return null;
          }).then(function (j) {
            return { httpOk: r.ok, body: j };
          });
        })
        .then(function (x) {
          if (x.httpOk && x.body && x.body.ok) return { ok: true, created: true, body: x.body };
          return { ok: false, created: false, error: (x.body && x.body.error) || 'thumbnail_upload_failed' };
        });
    }

    var gen = opts.blob
      ? generateThumbnailFromBlob(opts.blob)
      : opts.dataUrl
        ? dataUrlToBlob(opts.dataUrl).then(generateThumbnailFromBlob)
        : opts.imageUrl
          ? generateThumbnailFromImageUrl(opts.imageUrl)
          : Promise.reject(new Error('No thumbnail source'));

    return gen.then(postThumb).catch(function (err) {
      return { ok: false, created: false, error: err && err.message ? err.message : String(err) };
    });
  }

  global.LanternThumbnail = {
    MAX_LONG_EDGE: MAX_LONG_EDGE,
    JPEG_QUALITY: JPEG_QUALITY,
    scaleToLongEdge: scaleToLongEdge,
    generateThumbnailFromImageUrl: generateThumbnailFromImageUrl,
    generateThumbnailFromBlob: generateThumbnailFromBlob,
    uploadBestEffort: uploadBestEffort,
  };
})(typeof window !== 'undefined' ? window : globalThis);
