/**
 * Prompt #121 — Staff Power Scroller contracts.
 * Usage: node worker/scripts/staff-power-list-121-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');

function loadBoth() {
  const sandbox = {
    console,
    document: {
      createElement: function () {
        return {
          className: '',
          style: {},
          setAttribute: function () {},
          appendChild: function () {},
          addEventListener: function () {},
          querySelectorAll: function () {
            return [];
          },
          innerHTML: '',
          textContent: '',
          value: '',
        };
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'app/js/lantern-power-list.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'app/js/lantern-staff-power-list.js'), 'utf8'), sandbox);
  return sandbox;
}

const sb = loadBoth();
const Power = sb.LanternPowerList;
const Staff = sb.LanternStaffPowerList;
const admin = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const teacher = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const powerCss = fs.readFileSync(path.join(root, 'app/css/lantern-power-list.css'), 'utf8');
const powerJs = fs.readFileSync(path.join(root, 'app/js/lantern-power-list.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail != null ? detail : '');
}
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}

assert(!!Power && !!Staff, '1 Staff uses canonical Power Scroller exports');
assert(admin.includes('lantern-power-list.js') && admin.includes('lantern-staff-power-list.js'), '1b admin loads power + staff helpers');
assert(admin.includes('staffPowerListMount') && admin.includes('lanternPowerList--staff'), '1c Staff mounts Power Scroller');
assert(!/id="usersBody"/.test(admin) && !/lanternMgmtRecordListHd--staff/.test(admin), '1d old staff nested header/body removed');

const users = [
  {
    username: 'eric.colorado',
    role: 'teacher',
    is_active: 1,
    email: 'eric@example.com',
    honorific: 'Mr.',
    first: 'Eric',
    last: 'Colorado',
  },
  {
    username: 'deana.pachelli',
    role: 'teacher',
    is_active: 1,
    email: 'deana@example.com',
    honorific: 'Mrs.',
    first: 'Deana',
    last: 'Pachelli',
    linked: true,
  },
  {
    username: 'admin.radle',
    role: 'admin',
    is_active: 1,
    email: 'radle@example.com',
    first: 'Rick',
    last: 'Radle',
    linked: true,
  },
  {
    username: 'old.teacher',
    role: 'teacher',
    is_active: 0,
    first: 'Old',
    last: 'Archived',
  },
].map(function (u) {
  return Staff.toStaffItem(
    {
      username: u.username,
      role: u.role,
      is_active: u.is_active,
      email: u.email,
      honorific: u.honorific,
    },
    {
      firstName: u.first,
      lastName: u.last,
      displayName: u.first + ' ' + u.last,
      roleLabel: u.role.charAt(0).toUpperCase() + u.role.slice(1),
      blLinked: !!u.linked,
      blLabel: u.linked ? 'Pachelli — Linked' : 'Needs Link',
      statusLabel: u.is_active ? 'Active' : 'Archived',
    }
  );
});

const byName = Power.sortItems(users, { key: 'name', dir: 'asc' }, Staff.getSortValue);
assert(byName[0].lastName === 'Archived' && byName[1].lastName === 'Colorado', '2 default last-name A–Z');

const byNameDesc = Power.sortItems(users, { key: 'name', dir: 'desc' }, Staff.getSortValue);
assert(byNameDesc[0].lastName === 'Radle', '3 name sort toggles Z–A');

const byUser = Power.sortItems(users, { key: 'username', dir: 'asc' }, Staff.getSortValue);
assert(byUser[0].username === 'admin.radle', '4 username sort');

const byRole = Power.sortItems(users, { key: 'role', dir: 'asc' }, Staff.getSortValue);
assert(byRole[0].role === 'admin', '5 role sort');

const byBl = Power.sortItems(users, { key: 'bl', dir: 'asc' }, Staff.getSortValue);
assert(byBl[0].blLinked === false, '6 BL needs-link sorts before linked (asc)');

const byStatus = Power.sortItems(users, { key: 'status', dir: 'asc' }, Staff.getSortValue);
assert(byStatus[0].statusKey === 'active' || byStatus[0].active === true, '7 status sort');

const searchName = Power.filterItems(users, 'Colorado', Staff.getSearchText, { status: 'all', link: 'all', role: 'all' }, Staff.matchFilter);
assert(searchName.length === 1 && searchName[0].username === 'eric.colorado', '8 search by name');

const searchUser = Power.filterItems(users, 'eric.colorado', Staff.getSearchText, { status: 'all', link: 'all', role: 'all' }, Staff.matchFilter);
assert(searchUser.length === 1, '9 search by username');

const searchEmail = Power.filterItems(users, 'eric@example.com', Staff.getSearchText, { status: 'all', link: 'all', role: 'all' }, Staff.matchFilter);
assert(searchEmail.length === 1, '10 search by email');

const activeOnly = Power.filterItems(users, '', Staff.getSearchText, { status: 'active', link: 'all', role: 'all' }, Staff.matchFilter);
assert(activeOnly.every((x) => x.active) && activeOnly.length === 3, '11 Active filter');

const archivedOnly = Power.filterItems(users, '', Staff.getSearchText, { status: 'archived', link: 'all', role: 'all' }, Staff.matchFilter);
assert(archivedOnly.length === 1 && !archivedOnly[0].active, '11b Archived filter');

const needsLink = Power.filterItems(users, '', Staff.getSearchText, { status: 'active', link: 'needs_link', role: 'all' }, Staff.matchFilter);
assert(needsLink.length === 1 && needsLink[0].username === 'eric.colorado', '12 Needs Link filter');

const linked = Power.filterItems(users, '', Staff.getSearchText, { status: 'all', link: 'linked', role: 'all' }, Staff.matchFilter);
assert(linked.every((x) => x.blLinked) && linked.length === 2, '12b Linked filter');

const teachers = Power.filterItems(users, '', Staff.getSearchText, { status: 'all', link: 'all', role: 'teacher' }, Staff.matchFilter);
assert(teachers.every((x) => x.role === 'teacher') && teachers.length === 3, '13 role filter teacher');

assert(powerJs.includes('expandedId') && powerJs.includes('other.open = false'), '14 one expanded row preference');
assert(admin.includes("textContent = 'Edit'") && admin.includes('openEditUserPanel'), '15 Edit in expanded row');
assert(admin.includes('Reset Temporary Password') && admin.includes('openTempPwPanel'), '16 temp password in expanded');
assert(admin.includes('Manage Avatar') && admin.includes('openAdminAvatarPanel'), '17 avatar in expanded');
assert(admin.includes("textContent = 'Archive'") && admin.includes("textContent = 'Restore'"), '18 archive/restore in expanded');
assert(admin.includes('Behavior Logger Link') && admin.includes('Link Behavior Logger identity') && admin.includes('/api/admin/tms-identity-links'), '19 BL selector/link control preserved');
assert(powerCss.includes('lanternPowerList--staff') && powerCss.includes('overflow: visible'), '20 no nested-scroll clipping in power list');
assert(!admin.includes('staffPowerListMount') || !/staffPowerListMount[\s\S]{0,200}teacherCollapsibleListScroll/.test(admin), '20b Staff mount not wrapped in mini-scroll');
assert(!/auto.?link|fuzzy/i.test(admin.match(/fillStaffExpandedDetail[\s\S]*?function ensureStaffPowerList/)?.[0] || '') || admin.includes('No fuzzy matching'), '21 no automatic BL linking (manual confirm remains)');
assert(teacher.includes('moderationPowerListMount') && teacher.includes('lantern-power-list.js'), '22 Moderation Power Scroller still present');

const eric = users.find((u) => u.username === 'eric.colorado');
assert(eric && eric.blLabel === 'Needs Link' && eric.active && eric.role === 'teacher', 'Eric Colorado structural Needs Link case');

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
