/**
 * Prompt #228 — direct submit, spatial races, C-major audio, picker architecture.
 * Usage: node worker/scripts/interaction-race-228-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

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

const revealSrc = fs.readFileSync(path.join(root, 'app/js/lantern-result-reveal.js'), 'utf8');
const audioSrc = fs.readFileSync(path.join(root, 'app/js/lantern-race-audio.js'), 'utf8');
const bankSrc = fs.readFileSync(path.join(root, 'app/js/lantern-reaction-bank.js'), 'utf8');
const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const finalRx = fs.readFileSync(path.join(root, 'app/js/lantern-final-reactions.js'), 'utf8');
const rx = fs.readFileSync(path.join(root, 'app/js/lantern-reactions.js'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const rxCss = fs.readFileSync(path.join(root, 'app/css/lantern-reactions.css'), 'utf8');
const contribute = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');
const explore = fs.readFileSync(path.join(root, 'app/explore.html'), 'utf8');

assert(!/textContent = 'Lock In'/.test(cardUi), 'polls: no Lock In button text');
assert(!/pollLockInBtn/.test(cardUi), 'polls: no Lock In control in JS');
assert(/submitPollChoice/.test(cardUi), 'polls: tap submits immediately');
assert(/group\._busy/.test(cardUi), 'polls: in-flight disable');
assert(/mountPollMineCartRace/.test(cardUi), 'polls: mine-cart race wired');

assert(!/Lock it in!/.test(finalRx), 'reactions: no Lock it in');
assert(!/lanternFinalRxConfirm/.test(finalRx), 'reactions: no confirm popover');
assert(/submitChoice/.test(finalRx), 'reactions: tap submits immediately');
assert(/mountReactionSpatialRace/.test(finalRx), 'reactions: spatial race from icons');
assert(/lanternRxLane/.test(finalRx), 'reactions: lane wrapping around real icons');

assert(/lanternMineCartSvg/.test(revealSrc) && /viewBox="0 0 48 36"/.test(revealSrc), 'SVG mine cart present');
assert(!/🛒|🏎️/.test(revealSrc), 'no emoji cart/car');
assert(/data-race-kind', 'poll-minecart'/.test(revealSrc) || /poll-minecart/.test(revealSrc), 'horizontal poll race kind');
assert(/data-race-kind', 'reaction-spatial'/.test(revealSrc) || /reaction-spatial/.test(revealSrc), 'vertical reaction race kind');
assert(/translateY\(-\$\{h\}px\)/.test(revealSrc) || /translateY\(-' \+ h \+ 'px\)/.test(revealSrc), 'icon lifts with bar');
assert(/function measureRide/.test(revealSrc) && /barFromBottom/.test(revealSrc), 'bar bottom pinned to icon rest position');
assert(/cart\.style\.left = p \+ '%'/.test(revealSrc), 'cart left follows leading edge');
assert(/MAX_BAR_PX/.test(revealSrc) && /grown = elapsed \* velocity/.test(revealSrc), 'shared %-point velocity');
assert(/maxPct \/ MAX_MS/.test(revealSrc), 'speed = maxResult / 3s');
assert(/prefersReducedMotion/.test(revealSrc), 'reduced motion respected');

assert(/C_MAJOR_HZ/.test(audioSrc) && /261\.626/.test(audioSrc) && /523\.251/.test(audioSrc), 'C4–C5 mapping');
assert(/ensureFromGesture/.test(audioSrc), 'audio initializes from user gesture');
assert(/lantern\.raceSound\.muted/.test(audioSrc), 'stable mute preference key');
assert(/prefersReducedMotion/.test(audioSrc) && /audioAllowed/.test(audioSrc), 'reduced-motion skips forced audio');
assert(/muteControlHtml/.test(audioSrc) && /data-race-sound-btn/.test(audioSrc), 'mute control present');

assert(/GRID_ROWS = 4/.test(bankSrc) && /GRID_COLS = 5/.test(bankSrc), 'picker 4×5 grid');
assert(/unresolved_membership/.test(bankSrc), 'bank membership unresolved');
assert(/DEFAULT_FIVE/.test(bankSrc) && /heart/.test(bankSrc) && /fire/.test(bankSrc), 'default five preserved');
assert(/canonicalSort/.test(bankSrc), 'canonical order helper');
assert(/PRODUCT DECISION BLOCKER/.test(bankSrc), 'blocker documented in code');
assert(/mountPicker/.test(contribute) && /contributeReactionPickerHost/.test(contribute), 'Create mounts picker architecture');

assert(!/18 votes|12 reactions|23 responses|students chose this/.test(cardUi + finalRx + rx + revealSrc), 'percentage-only: no popularity counts');
assert(/Your choice/.test(finalRx) && /Your choice/.test(cardUi), 'selected state marked');
assert(/lantern-race-audio\.js/.test(explore) && /lantern-reaction-bank\.js/.test(explore), 'explore loads audio + bank');
assert(/display:\s*none\s*!important/.test(cardsCss) && /pollLockInBtn/.test(cardsCss), 'Lock In CSS hidden');
assert(/lanternMineCart/.test(cardsCss) && /lanternPollRaceTrack/.test(cardsCss), 'poll track CSS');
assert(/lanternRxRaceBar/.test(rxCss) && /lanternRxLane/.test(rxCss), 'vertical bar CSS');

const store = {};
const sandbox = {
  window: {},
  self: {},
  document: {
    createElement: function () {
      return {
        className: '',
        style: {},
        setAttribute: function () {},
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; },
        appendChild: function () {},
        addEventListener: function () {},
      };
    },
  },
  matchMedia: function () { return { matches: false }; },
  requestAnimationFrame: function () { return 0; },
  localStorage: {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
  },
  AudioContext: function () {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
    this.createOscillator = function () {
      return {
        type: 'sine',
        frequency: { setValueAtTime: function () {} },
        connect: function () {},
        start: function () {},
        stop: function () {},
      };
    };
    this.createGain = function () {
      return {
        gain: { setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} },
        connect: function () {},
      };
    };
    this.createBiquadFilter = function () {
      return { type: 'lowpass', frequency: { value: 0 }, connect: function () {} };
    };
    this.resume = function () {};
  },
};
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.runInNewContext(audioSrc, sandbox);
vm.runInNewContext(bankSrc, sandbox);
vm.runInNewContext(revealSrc, sandbox);

const audio = sandbox.LANTERN_RACE_AUDIO;
const bank = sandbox.LANTERN_REACTION_BANK;
const api = sandbox.LANTERN_RESULT_REVEAL;

assert(api && api.MAX_MS === 3000, 'longest result target 3s');
assert(api.durationForPct(25, 100) < api.durationForPct(50, 100), 'shorter result finishes first');
assert(api.durationForPct(40, 80) === api.durationForPct(40, 80), 'tie durations match');
assert(api.durationForPct(80, 80) === 3000, 'leader uses full 3s');
assert(api.durationForPct(0, 50) >= 80, 'zero-ish duration clamped');
assert(api.clampPct(100) === 100 && api.clampPct(0) === 0, '0 and 100 clamp');

assert(audio.degreeForProgress(0) === 0, '0% → C4');
assert(audio.degreeForProgress(100) === 7, '100% → C5');
assert(audio.degreeForProgress(50) >= 3 && audio.degreeForProgress(50) <= 4, 'mid progress is mid-scale');
audio.ensureFromGesture();
assert(!!sandbox.AudioContext, 'gesture can construct audio context');
audio.setMuted(true);
assert(audio.isMuted() === true, 'mute preference set');
assert(store['lantern.raceSound.muted'] === '1', 'mute preference persists');
audio.setMuted(false);
assert(store['lantern.raceSound.muted'] === '0', 'unmute persists');

assert(bank.DEFAULT_FIVE.length === 5, 'default five length');
assert(bank.DEFAULT_FIVE.map(function (v) { return v.emoji; }).join('') === '❤️⭐💡🤝🔥', 'default five emojis');
assert(bank.BANK_STATUS === 'unresolved_membership', 'does not guess bank');
assert(bank.PLANNING_TWENTY_UNRESOLVED.length === 20, 'planning list documented only');
assert(
  JSON.stringify(bank.canonicalSort(['fire', 'heart', 'lightbulb'])) === JSON.stringify(['heart', 'lightbulb', 'fire']),
  'published order is canonical, not click order'
);
assert(bank.canonicalSort(['fire', 'heart', 'heart']).length === 2, 'no duplicates');
assert(bank.clampSelection(['heart', 'star', 'lightbulb', 'teamwork', 'fire', 'wow']).length === 5, 'cap at 5');
assert(bank.canonicalSort(['wow', 'cool']).length === 0, 'unresolved planning types are not live options');

const reduced = {
  window: {},
  self: {},
  matchMedia: function () { return { matches: true }; },
  requestAnimationFrame: function () { return 0; },
  localStorage: sandbox.localStorage,
};
reduced.window = reduced;
reduced.self = reduced;
vm.runInNewContext(audioSrc, reduced);
assert(reduced.LANTERN_RACE_AUDIO.prefersReducedMotion() === true, 'reduced motion detected');
assert(reduced.LANTERN_RACE_AUDIO.audioAllowed() === false, 'reduced motion does not force race audio');

console.log('\n--- interaction-race-228-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
