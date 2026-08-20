/**
 * Prompt #232 — Create preview hardening + local Audio / Song studio.
 * Usage: node worker/scripts/create-preview-232-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail || '');
}
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}

const contribute = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const audioCss = fs.readFileSync(path.join(root, 'app/css/lantern-audio-studio.css'), 'utf8');
const audioJs = fs.readFileSync(path.join(root, 'app/js/lantern-audio-studio.js'), 'utf8');
const scaleJs = fs.readFileSync(path.join(root, 'app/js/lantern-studio-opened-preview-scale.js'), 'utf8');
const streamJs = fs.readFileSync(path.join(root, 'app/js/lantern-studio-stream-grid.js'), 'utf8');

assert(/option value="audio">Audio \/ Song</.test(contribute), 'Audio / Song create type is selectable');
assert(/id="variantAudio"/.test(contribute) && /id="audioFileInput"/.test(contribute), 'local MP3 + audio form exist');
assert(/Neon Burst/.test(contribute) && /Sonic Storm/.test(contribute) && /Tunnel Beam/.test(contribute), 'three visualizer styles present');
assert(/audioColor1/.test(contribute) && /audioRandomizeBtn/.test(contribute), 'colors + randomize present');
assert(/studioFeedHero/.test(contribute) && /aspect-ratio:\s*16 \/ 9/.test(audioCss), '16:9 in-feed hero contract');
assert(/minmax\(0,\s*1fr\)/.test(contribute) && /grid-template-areas:/.test(contribute), 'responsive preview uses grid minmax + areas');
assert(/min-width:\s*0/.test(contribute) && /max-width:\s*100%/.test(contribute), 'no fixed-width overflow: min-width 0 / max-width 100%');
assert(/max-width:\s*1099px/.test(contribute) && /@media \(max-width:\s*699px\)/.test(contribute), 'medium and narrow reflow breakpoints');
assert(/editor editor/.test(contribute) && /"editor"/.test(contribute), 'editor stays first when stacked');
assert(/min-width:\s*0/.test(cardsCss) && /max-width:\s*min\(100%/.test(cardsCss), 'opened preview modal is fluid');
assert(/stage\.style\.transform = 'none'/.test(scaleJs), 'opened preview no longer uses scale() for layout');
assert(/ResizeObserver/.test(audioJs) && /devicePixelRatio/.test(audioJs), 'canvas tracks rendered size + DPR');
assert(/createMediaElementSource/.test(audioJs) && /createAnalyser/.test(audioJs), 'analyser uses real audio path');
assert(/revokeObjectURL/.test(audioJs) && /audioCtx\.close/.test(audioJs), 'object URL + AudioContext cleanup');
assert(/visibilitychange/.test(audioJs) && /function dispose/.test(audioJs), 'pause/hide/dispose stops the loop');
assert(/renderCardArt/.test(audioJs) && /1280/.test(audioJs), 'static 16:9 card-art generator exists');
assert(!/\/api\/.*upload/.test(audioJs) && !/fetch\(/.test(audioJs), 'audio studio performs no network upload');
assert(/Preview only — not uploaded/.test(contribute) || /not uploaded/.test(contribute), 'UI states local-preview only');
assert(/ct === 'audio'/.test(contribute) && /not uploaded or saved/.test(contribute), 'submit does not publish audio');
assert(/option value="post">News \/ Update</.test(contribute) && /option value="poll">Poll</.test(contribute), 'existing Create types remain');
assert(/LANTERN_STUDIO_STREAM_GRID\.mount/.test(contribute), 'existing feed grid still mounted');
assert(/mountStudioNewsOpenedInto/.test(contribute), 'existing opened preview renderer still used');
assert(/lantern-audio-studio\.js/.test(contribute) && /lantern-audio-studio\.css/.test(contribute), 'audio assets loaded on Create');
assert(/specNewsRailCard/.test(streamJs), 'stream grid still uses canonical cards');

const sandbox = {
  window: {},
  self: {},
  document: {
    createElement: function (tag) {
      return {
        tagName: String(tag || '').toUpperCase(),
        style: {},
        width: 0,
        height: 0,
        paused: true,
        ended: false,
        currentTime: 0,
        duration: 0,
        muted: false,
        src: '',
        setAttribute: function () {},
        removeAttribute: function () {},
        load: function () {},
        pause: function () { this.paused = true; },
        play: function () { this.paused = false; return Promise.resolve(); },
        addEventListener: function () {},
        getContext: function () {
          return {
            fillRect: function () {},
            fillText: function () {},
            beginPath: function () {},
            arc: function () {},
            ellipse: function () {},
            moveTo: function () {},
            lineTo: function () {},
            stroke: function () {},
            fill: function () {},
            save: function () {},
            restore: function () {},
            translate: function () {},
            createRadialGradient: function () {
              return { addColorStop: function () {} };
            },
          };
        },
        toDataURL: function () { return 'data:image/png;base64,xxx'; },
      };
    },
    addEventListener: function () {},
    removeEventListener: function () {},
    hidden: false,
  },
  matchMedia: function () { return { matches: false }; },
  requestAnimationFrame: function () { return 1; },
  cancelAnimationFrame: function () {},
  devicePixelRatio: 1,
  AudioContext: function () {
    this.state = 'running';
    this.createAnalyser = function () {
      return {
        fftSize: 256,
        smoothingTimeConstant: 0.7,
        frequencyBinCount: 128,
        connect: function () {},
        disconnect: function () {},
        getByteFrequencyData: function (buf) { for (var i = 0; i < buf.length; i++) buf[i] = 40; },
        getByteTimeDomainData: function (buf) { for (var i = 0; i < buf.length; i++) buf[i] = 128; },
      };
    };
    this.createMediaElementSource = function () {
      return { connect: function () {}, disconnect: function () {} };
    };
    this.close = function () { this.state = 'closed'; };
    this.destination = {};
  },
  URL: {
    createObjectURL: function () { return 'blob:audio-preview-232'; },
    revokeObjectURL: function (u) { sandbox._revoked = u; },
  },
};
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.runInNewContext(audioJs, sandbox);
const AS = sandbox.LANTERN_AUDIO_STUDIO;
assert(!!AS, 'LANTERN_AUDIO_STUDIO exported');
assert(AS.STYLES.join(',') === 'neon-burst,sonic-storm,tunnel-beam', 'style ids stable');
const file = { name: 'demo.mp3', type: 'audio/mpeg' };
const picked = AS.selectLocalFile(file);
assert(picked && picked.ok && picked.objectUrl.indexOf('blob:') === 0, 'local object URL created');
assert(AS.hasObjectUrl(), 'object URL tracked');
AS.setState({ style: 'sonic-storm', color1: '#123456', title: 'Test Song' });
const art1 = AS.renderCardArt(sandbox.document.createElement('canvas'), { title: 'Test Song' });
AS.setState({ style: 'tunnel-beam', color1: '#abcdef' });
const art2 = AS.renderCardArt(sandbox.document.createElement('canvas'), { title: 'Test Song' });
assert(!!art1 && !!art2, 'card art renders');
assert(AS.getState().style === 'tunnel-beam', 'visualizer settings update card-art state');
AS.dispose();
assert(sandbox._revoked === 'blob:audio-preview-232', 'dispose revokes object URL');
assert(!AS.hasObjectUrl(), 'object URL cleared after dispose');

console.log('\n--- create-preview-232-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
