/**
 * Whitelisted surface cosmetic registry — IDs map to controlled CSS vars/classes only.
 * Cosmetics decorate the shell around canonical LanternCards, never card geometry.
 */
(function (global) {
  'use strict';

  var DEFAULT_VARS = {
    '--surface-bg': 'linear-gradient(180deg, #070b12, #05070b)',
    '--surface-bg-image': 'none',
    '--surface-ink': '#eaf0ff',
    '--surface-muted': '#b9c6ea',
    '--surface-accent': '#5aa7ff',
    '--surface-accent-strong': '#7bb8ff',
    '--surface-progress': '#5aa7ff',
    '--surface-chip-border': 'rgba(255,255,255,0.12)',
    '--surface-chip-active': 'rgba(90,167,255,0.28)',
    '--surface-decoration-opacity': '0',
  };

  var BACKGROUND_GRADIENTS = {
    bg_stars: 'linear-gradient(180deg, rgba(30,20,60,.85), rgba(10,5,25,.98))',
    bg_sunset: 'linear-gradient(180deg, rgba(80,40,20,.7), rgba(20,10,5,.98))',
    bg_aurora: 'linear-gradient(135deg, rgba(20,60,80,.6), rgba(60,20,80,.6))',
    bg_galaxy: 'linear-gradient(180deg, rgba(15,5,35,.9), rgba(5,2,15,.99))',
    bg_classroom: 'linear-gradient(180deg, rgba(60,40,20,.5), rgba(15,10,5,.95))',
    bg_ocean: 'linear-gradient(180deg, rgba(10,40,60,.75), rgba(5,15,30,.98))',
    bg_forest: 'linear-gradient(180deg, rgba(15,45,25,.6), rgba(5,15,10,.95))',
    bg_midnight: 'linear-gradient(180deg, rgba(10,15,35,.9), rgba(5,5,15,.99))',
    bg_arcade: 'linear-gradient(135deg, rgba(80,20,80,.6), rgba(20,5,40,.95))',
    bg_hidden_lantern: 'linear-gradient(180deg, rgba(40,25,10,.7), rgba(15,8,2,.98))',
    bg_newsroom: 'linear-gradient(180deg, rgba(30,25,50,.6), rgba(10,8,25,.95))',
  };

  var ACCENT_VARS = {
    accent_gold: { accent: '#e8c547', strong: '#f0d875', progress: '#e8c547' },
    accent_sunset: { accent: '#ff9f5a', strong: '#ffb380', progress: '#ff9f5a' },
    accent_blue: { accent: '#5aa7ff', strong: '#7bb8ff', progress: '#5aa7ff' },
    accent_green: { accent: '#56d078', strong: '#7ae098', progress: '#56d078' },
    accent_arcade: { accent: '#b57bff', strong: '#c99aff', progress: '#b57bff' },
    accent_rainbow: { accent: '#ff7eb9', strong: '#ffd36e', progress: '#7bb8ff' },
    accent_glow: { accent: '#8fd4ff', strong: '#b8e4ff', progress: '#8fd4ff' },
    accent_silver: { accent: '#c8d4e8', strong: '#e2eaf5', progress: '#c8d4e8' },
  };

  var DECORATION_EFFECTS = {
    dec_sparkles: 'sparkles',
    dec_confetti: 'sparkles',
    dec_hearts: 'sparkles',
    dec_ribbon: 'sparkles',
    dec_border: 'sparkles',
    dec_gold_star: 'sparkles',
    dec_lantern_glow: 'sparkles',
  };

  /** @type {Record<string, { slot: string }>} */
  var SURFACE_COSMETICS = {};
  Object.keys(BACKGROUND_GRADIENTS).forEach(function (id) {
    SURFACE_COSMETICS[id] = { slot: 'background', gradient: BACKGROUND_GRADIENTS[id] };
  });
  Object.keys(ACCENT_VARS).forEach(function (id) {
    SURFACE_COSMETICS[id] = { slot: 'accent', vars: ACCENT_VARS[id] };
  });
  [
    'frame_silver', 'frame_gold', 'frame_rainbow', 'frame_legend', 'frame_blue', 'frame_green',
    'frame_school', 'frame_champion', 'frame_nugget_seeker', 'frame_hallway_hero',
  ].forEach(function (id) {
    SURFACE_COSMETICS[id] = { slot: 'frame', classSuffix: id.replace('frame_', '') };
  });
  Object.keys(DECORATION_EFFECTS).forEach(function (id) {
    SURFACE_COSMETICS[id] = { slot: 'decoration', effect: DECORATION_EFFECTS[id], classSuffix: id.replace('dec_', '') };
  });
  [
    'badge_star', 'badge_flame', 'badge_crown', 'badge_diamond', 'badge_book', 'badge_lightning',
    'badge_heart', 'badge_trophy', 'badge_artist', 'badge_secret_finder',
  ].forEach(function (id) {
    SURFACE_COSMETICS[id] = { slot: 'badge', classSuffix: id.replace('badge_', '') };
  });
  ['acc_hat', 'acc_glasses', 'acc_sparkle', 'acc_cap', 'acc_headphones', 'acc_bow', 'acc_medal'].forEach(function (id) {
    SURFACE_COSMETICS[id] = { slot: 'accessory', classSuffix: id.replace('acc_', '') };
  });

  function surfaceEl(surface) {
    if (!surface) return null;
    if (typeof surface === 'string') return global.document.querySelector(surface);
    if (surface.nodeType === 1) return surface;
    return null;
  }

  function clearSurfaceClasses(el, prefix) {
    if (!el || !el.classList) return;
    [].slice.call(el.classList).forEach(function (cls) {
      if (cls.indexOf(prefix) === 0) el.classList.remove(cls);
    });
  }

  function applyVars(el, vars) {
    if (!el || !el.style) return;
    Object.keys(vars).forEach(function (k) {
      el.style.setProperty(k, vars[k]);
    });
  }

  function clearSurfaceTheme(surface) {
    var el = surfaceEl(surface);
    if (!el) return;
    clearSurfaceClasses(el, 'surface-cosmetic-');
    el.removeAttribute('data-surface-background');
    el.removeAttribute('data-surface-effect');
    el.removeAttribute('data-surface-frame');
    el.classList.remove('lanternLockerSurface--themed');
    applyVars(el, DEFAULT_VARS);
    var effectLayer = global.document.getElementById('cosmeticEffectLayer');
    if (effectLayer) effectLayer.innerHTML = '';
  }

  function applyDefaultTheme(surface) {
    clearSurfaceTheme(surface);
    var el = surfaceEl(surface);
    if (!el) return;
    el.setAttribute('data-surface-theme', 'default');
  }

  function lookupCosmetic(id) {
    var key = id != null ? String(id).trim() : '';
    return key ? SURFACE_COSMETICS[key] || null : null;
  }

  /**
   * @param {Element|string} surface
   * @param {Record<string,string>|null} equippedMap slot -> cosmetic id
   * @param {{ effectLayerId?: string }} opts
   */
  function applyLockerTheme(surface, equippedMap, opts) {
    applyDefaultTheme(surface);
    var el = surfaceEl(surface);
    if (!el || !equippedMap || typeof equippedMap !== 'object') return;
    el.setAttribute('data-surface-theme', 'locker');
    el.classList.add('lanternLockerSurface--themed');
    var vars = Object.assign({}, DEFAULT_VARS);
    var effectLayerId = (opts && opts.effectLayerId) || 'cosmeticEffectLayer';
    var effectLayer = global.document.getElementById(effectLayerId);

    Object.keys(equippedMap).forEach(function (slot) {
      var cosmeticId = equippedMap[slot];
      var def = lookupCosmetic(cosmeticId);
      if (!def || def.slot !== slot) return;
      if (def.slot === 'background' && def.gradient) {
        vars['--surface-bg'] = def.gradient;
        vars['--surface-bg-image'] = 'none';
        el.setAttribute('data-surface-background', cosmeticId.replace('bg_', ''));
      }
      if (def.slot === 'accent' && def.vars) {
        vars['--surface-accent'] = def.vars.accent;
        vars['--surface-accent-strong'] = def.vars.strong;
        vars['--surface-progress'] = def.vars.progress;
        el.classList.add('surface-cosmetic-accent-' + cosmeticId.replace('accent_', ''));
      }
      if (def.slot === 'frame' && def.classSuffix) {
        el.setAttribute('data-surface-frame', def.classSuffix);
        el.classList.add('surface-cosmetic-frame-' + def.classSuffix);
      }
      if (def.slot === 'decoration' && def.effect) {
        vars['--surface-decoration-opacity'] = '1';
        el.setAttribute('data-surface-effect', def.effect);
        el.classList.add('surface-cosmetic-decoration-' + def.classSuffix);
        if (effectLayer && !global.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          effectLayer.className = 'cosmeticEffectLayer cosmeticEffectLayer--' + def.effect;
        }
      }
      if (def.slot === 'badge' && def.classSuffix) {
        el.classList.add('surface-cosmetic-badge-' + def.classSuffix);
      }
      if (def.slot === 'accessory' && def.classSuffix) {
        el.classList.add('surface-cosmetic-accessory-' + def.classSuffix);
      }
    });

    applyVars(el, vars);
  }

  global.LANTERN_SURFACE_THEME = {
    DEFAULT_VARS: DEFAULT_VARS,
    SURFACE_COSMETICS: SURFACE_COSMETICS,
    lookupCosmetic: lookupCosmetic,
    applyDefaultTheme: applyDefaultTheme,
    applyLockerTheme: applyLockerTheme,
    clearSurfaceTheme: clearSurfaceTheme,
  };
})(typeof window !== 'undefined' ? window : this);
