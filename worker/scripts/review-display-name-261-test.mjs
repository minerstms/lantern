/**
 * Prompt #261 — Review Submissions display student names, not raw IDs.
 * Usage: node worker/scripts/review-display-name-261-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildStaffPublicNameIndex,
  resolveMissionSubmitterPublicLabel,
  formatCompactPersonName,
} from '../staff-public-name.js';
import { buildReviewQueue } from '../moderation-review.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

let pass = 0;
let fail = 0;
function ok(m) { pass++; console.log('PASS', m); }
function bad(m, d) { fail++; console.error('FAIL', m, d != null ? d : ''); }
function assert(c, m, d) { if (c) ok(m); else bad(m, d); }

const idx = buildStaffPublicNameIndex([
  {
    username: 'lucas.r',
    role: 'student',
    mtss_student_id: '121680',
    display_name: 'Lucas Radle',
    public_display_name: 'Lucas R.',
    first_name: 'Lucas',
    last_name: 'Radle',
  },
]);

assert(
  resolveMissionSubmitterPublicLabel(idx, '121680', 'Lucas Radle') === 'Lucas R.',
  'raw mtss id resolves to public display name'
);
assert(
  resolveMissionSubmitterPublicLabel(idx, '121680', '') === 'Lucas R.',
  'index lookup without display fallback'
);
assert(formatCompactPersonName('121680') === '', 'numeric id never becomes compact label');
assert(
  resolveMissionSubmitterPublicLabel(buildStaffPublicNameIndex([]), '121680', '') === '',
  'unknown id without account returns empty (UI falls back to Student)'
);

const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const reviewJs = fs.readFileSync(path.join(root, 'app/js/lantern-review-queue.js'), 'utf8');
const modReview = fs.readFileSync(path.join(root, 'worker/moderation-review.js'), 'utf8');

assert(/function reviewStudentDisplayLabel/.test(teacherHtml), 'teacher reviewStudentDisplayLabel helper');
assert(/submitter_public_label/.test(reviewJs), 'legacy queue passes submitter_public_label');
assert(/enrichReviewSubmitterLabels/.test(modReview), 'server enriches review queue labels');
assert(/resolveMissionSubmitterPublicLabel/.test(modReview), 'uses canonical resolver');

// Mock queue: poll with raw id submitter
const db = {
  prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...a) { binds.push(...a); return api; },
      async first() {
        if (s.includes('lantern_poll_contributions')) {
          return { question: 'Test poll', character_name: '121680', status: 'pending' };
        }
        if (s.includes('lantern_pilot_accounts') && s.includes('mtss_student_id')) {
          return {
            mtss_student_id: '121680',
            display_name: 'Lucas Radle',
            public_display_name: 'Lucas R.',
            student_character_name: 'lucas.r',
            username: 'lucas.r',
            role: 'student',
          };
        }
        if (s.includes('COUNT(*)')) return { c: 0 };
        return null;
      },
      async all() {
        if (s.includes('lantern_approvals')) {
          return {
            results: [
              {
                id: 'ap1',
                item_type: 'poll_contribution',
                item_id: 'pc1',
                status: 'pending',
                submitted_by_actor_name: '121680',
                created_at: 't1',
              },
            ],
          };
        }
        if (s.includes('lantern_pilot_accounts') && s.includes("'student'")) {
          return {
            results: [
              {
                username: 'lucas.r',
                display_name: 'Lucas Radle',
                public_display_name: 'Lucas R.',
                first_name: 'Lucas',
                last_name: 'Radle',
                student_character_name: 'lucas.r',
                mtss_student_id: '121680',
                role: 'student',
              },
            ],
          };
        }
        if (s.includes('lantern_moderation_events')) return { results: [] };
        if (s.includes('lantern_content_flags')) return { results: [] };
        if (s.includes('lantern_mission_submissions')) return { results: [] };
        if (s.includes('lantern_feed_items')) return { results: [] };
        if (s.includes('tms_identity_links')) return { results: [] };
        return { results: [] };
      },
      async run() { return { success: true }; },
    };
    return api;
  },
};

const TEACHER = { username: 'mr_radle', role: 'teacher', teacher_id: 'mr_radle' };
const items = await buildReviewQueue(db, TEACHER, { includeDetails: true });
assert(items.length === 1, 'pending poll in queue', items);
assert(items[0].submitter_public_label === 'Lucas R.', 'queue card public label', items[0]);
assert(items[0].submitter === '121680' || items[0].submitter_key === '121680', 'raw key retained for avatar lookup');

console.log('\nreview-display-name-261-test:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
