/**
 * Prompt #225A — existing-mission Require Image / min characters persist + validate.
 * Usage: node worker/scripts/existing-mission-edit-225a-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  persistAllowsImageValue,
  missionRequiresImage,
  validateMissionSubmissionPayload,
  missionEditLockedFieldsPresent,
} from '../missions-auth.js';

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

if (missionEditLockedFieldsPresent({ require_image: true, min_characters: 20 }).length === 0) {
  ok('existing-mission requirement edits are not lock-blocked');
} else bad('requirement PATCH still locked');

if (persistAllowsImageValue({ require_image: false }, 2) === 1) ok('require OFF keeps image allowed (2→1)');
else bad('require off persist');
if (persistAllowsImageValue({ require_image: true }, 1) === 2) ok('require ON persists 2');
else bad('require on persist');
if (persistAllowsImageValue({ require_image: false }, 0) === 0) ok('require OFF on none stays 0');
else bad('none stays 0');

const teacher = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
if (/missionEditRequirementControlsHtml/.test(teacher) && /hasSubmissions/.test(teacher) && /data-edit="require_image"/.test(teacher)) {
  ok('teacher edit always exposes Require image controls');
} else bad('teacher existing-mission UI');
if (!/Audience &amp; submission requirements are locked/.test(teacher)) {
  ok('existing missions no longer hide requirement controls behind the old lock note');
} else bad('old lock copy still hides requirements');

function mission(req, min) {
  return {
    submission_type: 'text',
    allows_text: 1,
    allows_image: req ? 2 : 1,
    require_image: !!req,
    min_characters: min,
  };
}
function envelope(text, image) {
  return JSON.stringify({ text: text, image_url: image || '' });
}

const A = mission(false, 0);
if (validateMissionSubmissionPayload(A, 'text', 'short').ok) ok('A: OFF/0 text-only allowed');
else bad('A text-only');

const B = mission(true, 20);
const long = 'This line is twenty plus characters.';
if (!validateMissionSubmissionPayload(B, 'text', 'hi').ok) ok('B1: short/no image rejected');
else bad('B1');
if (!validateMissionSubmissionPayload(B, 'text', long).ok) ok('B2: long/no image rejected');
else bad('B2');
if (!validateMissionSubmissionPayload(B, 'text', envelope('hi', '/api/media/image?key=x')).ok) ok('B3: short+image rejected');
else bad('B3');
if (validateMissionSubmissionPayload(B, 'text', envelope(long, '/api/media/image?key=x')).ok) ok('B4: long+image accepted');
else bad('B4');

const C = mission(false, 50);
const fifty = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
if (!validateMissionSubmissionPayload(C, 'text', 'not enough').ok) ok('C: short/no image rejected at 50');
else bad('C short');
if (validateMissionSubmissionPayload(C, 'text', fifty).ok) ok('C: 50+ chars no image allowed');
else bad('C long no image');

if (missionRequiresImage({ allows_image: 1 }) === false && missionRequiresImage({ allows_image: 2 }) === true) {
  ok('allows_image 1=optional 2=required');
} else bad('require semantics');

const contribute = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');
if (/currentMissionRequiresImage/.test(contribute) && /Image required/.test(contribute) && !/\|\| 200/.test(contribute)) {
  ok('contribute student form shows Image required and does not coerce 0 to 200');
} else bad('contribute student requirements');

const missionsPage = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
if (/Number\.isFinite\(minRaw\) && minRaw >= 0 \? Math\.floor\(minRaw\) : 0/.test(missionsPage)) {
  ok('missions.html missing min_characters defaults to 0, not 200');
} else bad('missions page default min');

// Prompt #226A — new-mission Minimum Text Characters default is 0 (no minimum).
if (/id="missionMinChars"[^>]*value="0"/.test(teacher) && !/id="missionMinChars"[^>]*value="200"/.test(teacher)) {
  ok('new-mission Minimum text characters input defaults to 0');
} else bad('new-mission min chars default is not 0');
if (/Number\.isFinite\(minRaw\) && minRaw >= 0 \? minRaw : 0/.test(teacher)) {
  ok('create-submit empty/invalid min chars falls back to 0');
} else bad('create-submit still falls back to a positive min');
if ((teacher.match(/Changes apply to future submissions only\./g) || []).length >= 2) {
  ok('create + existing-mission requirement UIs show future-submissions-only helper');
} else bad('missing future-submissions-only helper copy');
if (!/confirm\([^)]*min_characters/.test(teacher) && !/confirm\([^)]*Minimum text/.test(teacher)) {
  ok('requirement edits do not use a confirmation modal');
} else bad('requirement edit still prompts confirm');

const lanternApi = fs.readFileSync(path.join(root, 'app/js/lantern-api.js'), 'utf8');
if (
  /if \(opts\.min_characters === undefined \|\| opts\.min_characters === null\) return 0;/.test(lanternApi) &&
  !/opts\.min_characters === undefined \|\| opts\.min_characters === null\) return 200/.test(lanternApi)
) {
  ok('lantern-api createTeacherMission missing min_characters defaults to 0');
} else bad('lantern-api create still defaults min to 200');

const handlers = fs.readFileSync(path.join(root, 'worker/missions-handlers.js'), 'utf8');
if (/minChars = submissionType === 'bug_report' \? 0 : 200/.test(handlers)) {
  bad('worker create still defaults ordinary missions to 200');
} else if (/if \(!Number\.isFinite\(minChars\)\) \{\s*minChars = 0;/.test(handlers)) {
  ok('worker create missing min_characters defaults to 0');
} else bad('worker create default is not 0');
if (/bindings\.push\(Number\.isFinite\(mc\) \? mc : 200\)/.test(handlers)) {
  bad('worker PATCH invalid min_characters still falls back to 200');
} else if (/bindings\.push\(Number\.isFinite\(mc\) \? mc : 0\)/.test(handlers)) {
  ok('worker PATCH invalid min_characters falls back to 0');
} else bad('worker PATCH min fallback missing');

const patchBlock = handlers.slice(handlers.indexOf("if (request.method === 'PATCH' && missionIdMatch)"));
const patchUntilNext = patchBlock.slice(0, patchBlock.indexOf("if (request.method === 'DELETE'"));
if (/min_characters = \?/.test(patchUntilNext) && !/UPDATE lantern_mission_submissions/.test(patchUntilNext)) {
  ok('PATCH min_characters updates the mission only — prior submissions are not rewritten');
} else bad('PATCH path may rewrite submission history');

const createdAtZero = mission(false, 0);
const priorShort = 'ok';
if (validateMissionSubmissionPayload(createdAtZero, 'text', priorShort).ok) {
  ok('create-at-0: short prior submission would have been accepted');
} else bad('create-at-0 should accept short text');
const laterMin50 = mission(false, 50);
const fiftyChars = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
if (!validateMissionSubmissionPayload(laterMin50, 'text', priorShort).ok) {
  ok('after edit to 50: future short text is rejected');
} else bad('future short should reject at 50');
if (validateMissionSubmissionPayload(laterMin50, 'text', fiftyChars).ok) {
  ok('after edit to 50: future 50+ text is accepted');
} else bad('future 50+ should accept');
if (validateMissionSubmissionPayload(createdAtZero, 'text', priorShort).ok) {
  ok('prior short payload is not retroactively invalid against the original 0 rule');
} else bad('original 0-rule payload should still validate as stored');

console.log('\n--- existing-mission-edit-225a-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
