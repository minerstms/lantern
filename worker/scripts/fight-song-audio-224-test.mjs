/**
 * Prompt #224 — Fight Song Challenge audio wiring.
 * Usage: node worker/scripts/fight-song-audio-224-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let passed = 0;
let failed = 0;
function ok(msg) { passed++; console.log('PASS', msg); }
function bad(msg, detail) { failed++; console.log('FAIL', msg, detail != null ? detail : ''); }

const clientSrc = fs.readFileSync(path.join(root, 'app/js/lantern-fight-song-challenge.js'), 'utf8');
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
const missionsCss = fs.readFileSync(path.join(root, 'app/css/lantern-missions-page.css'), 'utf8');
const appMp3 = path.join(root, 'app/assets/stand-up-and-cheer.mp3');
const rootMp3 = path.join(root, 'assets/stand-up-and-cheer.mp3');

if (clientSrc.includes("AUDIO_SRC = 'assets/stand-up-and-cheer.mp3'") && fs.existsSync(appMp3)) {
  const magic = fs.readFileSync(appMp3).subarray(0, 3).toString('ascii');
  if (magic === 'ID3' || magic.charCodeAt(0) === 0xff) ok('1. Fight Song Challenge references assets/stand-up-and-cheer.mp3');
  else bad('1. mp3 magic', magic);
} else bad('1. audio src / file missing');

if (fs.existsSync(rootMp3) && fs.statSync(appMp3).size === fs.statSync(rootMp3).size) {
  ok('canonical mp3 present in app/assets and assets/');
} else bad('dual mp3 copy');

if (
  missionsHtml.includes('Start with Sound') &&
  clientSrc.includes('Start with Sound') &&
  missionsHtml.includes('id="fightSongStartSoundBtn"')
) {
  ok('2. preview exposes Start with Sound');
} else bad('2. start with sound');

if (
  missionsHtml.includes('Start Silently') &&
  clientSrc.includes('Start Silently') &&
  missionsHtml.includes('id="fightSongStartSilentBtn"')
) {
  ok('3. preview exposes Start Silently');
} else bad('3. start silently');

if (
  !/autoplay/i.test(clientSrc) &&
  clientSrc.includes('prepareAudio') &&
  clientSrc.includes('setPhase(\'preview\')') &&
  /function prepareAudio[\s\S]*pause\(/.test(clientSrc)
) {
  ok('4. opening preview does not autoplay audible audio');
} else bad('4. preview autoplay guard');

function loadClient() {
  const nodes = Object.create(null);
  function makeNode(id) {
    if (nodes[id]) return nodes[id];
    const node = {
      id,
      hidden: false,
      textContent: '',
      className: '',
      classList: {
        _c: {},
        add: function (n) { this._c[n] = true; node.className += ' ' + n; },
        remove: function (n) { delete this._c[n]; },
        contains: function (n) { return !!this._c[n]; },
        toggle: function (n, on) { if (on) this.add(n); else this.remove(n); },
      },
      style: {},
      value: '',
      disabled: false,
      focus: function () {},
      setAttribute: function () {},
      getAttribute: function () { return ''; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      addEventListener: function () {},
      appendChild: function () {},
      closest: function () { return null; },
      innerHTML: '',
    };
    nodes[id] = node;
    return node;
  }
  const fakeAudio = {
    src: '',
    muted: true,
    volume: 1,
    currentTime: 12,
    loop: false,
    paused: true,
    preload: '',
    play: function () { this.paused = false; return Promise.resolve(); },
    pause: function () { this.paused = true; },
    load: function () {},
    addEventListener: function () {},
  };
  const sandbox = {
    window: {},
    Math,
    console,
    Audio: function () { return fakeAudio; },
    document: {
      getElementById: function (id) { return makeNode(id); },
      createElement: function (tag) { return makeNode(tag + Math.random()); },
      body: { appendChild: function () {} },
      addEventListener: function () {},
      activeElement: null,
    },
    fetch: function () {
      return Promise.resolve({ json: function () { return Promise.resolve({ ok: false }); } });
    },
    setTimeout: function (fn) { return 0; },
    clearTimeout: function () {},
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window = sandbox;
  vm.runInNewContext(clientSrc, sandbox);
  return { api: sandbox.window.LANTERN_FIGHT_SONG || sandbox.LANTERN_FIGHT_SONG, audio: fakeAudio };
}

const loaded = loadClient();
const api = loaded.api;
const audio = loaded.audio;

if (api && api.AUDIO_SRC === 'assets/stand-up-and-cheer.mp3' && api.DEFAULT_VOLUME === 0.4) {
  ok('audio constant + default volume 40%');
} else bad('audio constants', api && api.DEFAULT_VOLUME);

api.open({});
const previewState = api.getAudioState();
if (previewState.phase === 'preview' && previewState.paused && previewState.muted && audio.currentTime === 0) {
  ok('4b. open() stays in preview, muted, reset, not playing');
} else bad('4b. open state', previewState);

api.startWithSound();
const soundState = api.getAudioState();
if (
  soundState.phase === 'play' &&
  soundState.started &&
  soundState.muted === false &&
  Math.abs(soundState.volume - 0.4) < 0.001 &&
  soundState.loop &&
  audio.paused === false &&
  audio.currentTime === 0
) {
  ok('5. sound start begins unmuted at 40% from the beginning');
} else bad('5. sound start', soundState);

const silentClient = loadClient();
silentClient.api.open({});
silentClient.api.startSilently();
const silentState = silentClient.api.getAudioState();
if (silentState.started && silentState.muted === true && Math.abs(silentState.volume - 0.4) < 0.001) {
  ok('6. silent start begins muted');
} else bad('6. silent start', silentState);

audio.currentTime = 17;
api.setMuted(true);
const muted = api.getAudioState();
if (muted.muted && muted.currentTime === 17) {
  ok('7. mute toggle preserves playback position');
} else bad('7. mute position', muted);
api.setMuted(false);
if (api.getAudioState().muted === false && api.getAudioState().currentTime === 17) {
  ok('7b. unmute preserves playback position');
} else bad('7b. unmute position');

api.setVolume(70);
const vol = api.getAudioState();
if (Math.abs(vol.volume - 0.7) < 0.001 && vol.muted === false) {
  ok('8. volume can be changed in-game');
} else bad('8. volume', vol);

if (clientSrc.includes('node.loop = true') && api.getAudioState().loop) {
  ok('9. audio loops while challenge is active');
} else bad('9. loop');

api.close();
const closed = api.getAudioState();
if (closed.paused && closed.currentTime === 0 && closed.phase === 'closed' && !closed.started) {
  ok('10. closing challenge stops/resets audio');
} else bad('10. close', closed);

if (
  clientSrc.includes('fadeOutThenStop') &&
  clientSrc.includes('finishSuccess') &&
  /function finishSuccess[\s\S]*fadeOutThenStop/.test(clientSrc)
) {
  ok('11. completion fades/stops audio without blocking success');
} else bad('11. completion fade');

if (
  clientSrc.includes('Sound unavailable') &&
  clientSrc.includes('audioState.unavailable') &&
  clientSrc.includes('playAudioSafe')
) {
  ok('12. failed audio does not break game');
} else bad('12. audio failure');

if (
  missionsHtml.includes('id="fightSongList"') &&
  missionsHtml.includes('id="fightSongUpBtn"') &&
  missionsHtml.includes('draggable') === false &&
  clientSrc.includes("setAttribute('draggable', 'true')") &&
  clientSrc.includes('fightSongAudioBar') &&
  missionsCss.includes('touch-action: none') &&
  missionsCss.includes('.fightSongAudioBar')
) {
  ok('13. audio controls do not replace lyric reorder controls');
} else bad('13. lyric controls');

if (
  !clientSrc.includes('localStorage') &&
  !clientSrc.includes('youtube') &&
  !clientSrc.includes('iframe') &&
  clientSrc.includes('No sound? Check your device volume.')
) {
  ok('session-only volume; no remote/YouTube audio; device-volume helper present');
} else bad('audio policy');

console.log('\nFight Song audio #224:', passed, 'passed,', failed, 'failed');
if (failed) process.exit(1);
