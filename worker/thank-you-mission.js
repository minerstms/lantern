/**
 * Prompt #204 — Thank a Teacher: direct staff email + mission completion +1 Nugget.
 * No pre-send teacher approval. Reuses TMS bridge mail (existing Resend on Behavior Logger Worker).
 */
import {
  WAVE2_MISSION_IDS,
  completeMissionByEvent,
  denverLocalDateYYYYMMDD,
  SCHOOL_SCHEDULE_TIMEZONE,
} from './mission-event-completions.js';
import { parsePeopleToken, privacySafeStaffLabel, privacySafeStudentLabel } from './content-people.js';

export const THANK_YOU_MISSION_ID = WAVE2_MISSION_IDS.THANK_YOU;
export const THANK_YOU_MESSAGE_MIN = 10;
export const THANK_YOU_MESSAGE_MAX = 1000;

export function eventKeyThankYou(characterName, dayYYYYMMDD) {
  return `thank_you:${String(characterName || '').trim()}:${String(dayYYYYMMDD || '').trim()}`;
}

function trimStr(v) {
  return v != null ? String(v).trim() : '';
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function validateThankYouMessage(raw) {
  const message = trimStr(raw);
  if (!message) return { ok: false, error: 'message_required' };
  if (message.length < THANK_YOU_MESSAGE_MIN) return { ok: false, error: 'message_too_short', min: THANK_YOU_MESSAGE_MIN };
  if (message.length > THANK_YOU_MESSAGE_MAX) {
    return { ok: false, error: 'message_too_long', max: THANK_YOU_MESSAGE_MAX };
  }
  return { ok: true, message };
}

/**
 * Resolve canonical TMS staff recipient + display label (never returns email to callers of the HTTP API).
 */
export async function resolveThankYouStaffRecipient(db, tmsStaffIdRaw) {
  const tmsStaffId = trimStr(tmsStaffIdRaw);
  if (!tmsStaffId) return { ok: false, error: 'recipient_required' };

  let row = null;
  try {
    row = await db
      .prepare(
        `SELECT l.tms_staff_id AS tms_staff_id,
                MAX(CASE WHEN l.is_primary = 1 THEN p.display_name ELSE NULL END) AS primary_display,
                MAX(p.display_name) AS any_display,
                MAX(p.first_name) AS first_name,
                MAX(p.last_name) AS last_name,
                MAX(CASE WHEN l.is_primary = 1 THEN p.username ELSE NULL END) AS primary_username,
                MAX(p.username) AS username,
                MAX(CASE WHEN l.is_primary = 1 THEN p.honorific ELSE NULL END) AS primary_honorific,
                MAX(CASE WHEN p.honorific IS NOT NULL AND trim(p.honorific) != '' THEN p.honorific ELSE NULL END) AS any_honorific,
                MAX(CASE WHEN l.is_primary = 1 THEN p.public_display_name ELSE NULL END) AS primary_public_display,
                MAX(CASE WHEN p.public_display_name IS NOT NULL AND trim(p.public_display_name) != '' THEN p.public_display_name ELSE NULL END) AS any_public_display,
                MAX(CASE WHEN l.is_primary = 1 THEN p.role ELSE NULL END) AS primary_role,
                MAX(p.role) AS any_role,
                MAX(CASE WHEN l.is_primary = 1 AND p.email IS NOT NULL AND trim(p.email) != '' THEN p.email ELSE NULL END) AS primary_email,
                MAX(CASE WHEN p.email IS NOT NULL AND trim(p.email) != '' THEN p.email ELSE NULL END) AS any_email,
                MAX(CASE WHEN p.is_active IS NULL OR CAST(p.is_active AS INTEGER) = 1 THEN 1 ELSE 0 END) AS any_active
         FROM tms_identity_links l
         INNER JOIN lantern_pilot_accounts p
           ON lower(trim(p.username)) = lower(trim(l.lantern_username))
         WHERE lower(trim(l.tms_staff_id)) = lower(trim(?))
           AND lower(trim(p.role)) IN ('teacher', 'admin', 'staff')
         GROUP BY l.tms_staff_id`
      )
      .bind(tmsStaffId)
      .first();
  } catch (_) {
    row = null;
  }

  if (!row || !Number(row.any_active)) {
    return { ok: false, error: 'recipient_invalid' };
  }

  const label = privacySafeStaffLabel({
    display_name: row.primary_display || row.any_display,
    first_name: row.first_name,
    last_name: row.last_name,
    username: row.primary_username || row.username,
    honorific: row.primary_honorific || row.any_honorific,
    public_display_name: row.primary_public_display || row.any_public_display,
    role: row.primary_role || row.any_role,
  });
  if (!label) return { ok: false, error: 'recipient_invalid' };

  return {
    ok: true,
    tms_staff_id: trimStr(row.tms_staff_id) || tmsStaffId,
    display_label: label,
    lantern_email: trimStr(row.primary_email) || trimStr(row.any_email) || null,
  };
}

async function resolveTmsStaffEmailViaBridge(env, tmsStaffId) {
  const secret = trimStr(env && env.TMS_LANTERN_BRIDGE_SECRET);
  if (!secret) return { ok: false, error: 'bridge_not_configured' };
  const base = trimStr(env.TMS_NUGGETS_API_BASE_URL || 'https://mtss-behavior-log.mrradle.workers.dev').replace(/\/$/, '');
  let resp;
  try {
    resp = await fetch(base + '/api/lantern-bridge/staff/list', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + secret,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
  } catch (_) {
    return { ok: false, error: 'bridge_request_failed' };
  }
  let data;
  try {
    data = await resp.json();
  } catch (_) {
    return { ok: false, error: 'bridge_bad_response' };
  }
  if (!resp.ok || !data || data.ok === false) {
    return { ok: false, error: (data && data.error) || 'bridge_failed' };
  }
  const list = Array.isArray(data.staff) ? data.staff : Array.isArray(data.results) ? data.results : [];
  const want = lowerId(tmsStaffId);
  for (const s of list) {
    const id = trimStr(s.tms_staff_id || s.teacher_id || s.id);
    if (lowerId(id) !== want) continue;
    const email = trimStr(s.teacher_email || s.email);
    if (email && email.indexOf('@') > 0) {
      return { ok: true, email, display_name: trimStr(s.teacher_name || s.display_name) || null };
    }
    return { ok: false, error: 'staff_email_missing' };
  }
  return { ok: false, error: 'recipient_invalid' };
}

function lowerId(v) {
  return trimStr(v).toLowerCase();
}

/**
 * Authoritative recipient email — never returned to the browser API response.
 */
export async function resolveThankYouRecipientEmail(db, env, recipient) {
  if (!recipient || !recipient.ok) return { ok: false, error: 'recipient_invalid' };
  const fromLantern = trimStr(recipient.lantern_email);
  if (fromLantern && fromLantern.indexOf('@') > 0) {
    return { ok: true, email: fromLantern, source: 'lantern_pilot_accounts' };
  }
  const bridged = await resolveTmsStaffEmailViaBridge(env, recipient.tms_staff_id);
  if (bridged.ok) return { ok: true, email: bridged.email, source: 'tms_staff' };
  return { ok: false, error: bridged.error || 'staff_email_missing' };
}

export async function sendThankYouEmailViaBridge(env, payload) {
  const secret = trimStr(env && env.TMS_LANTERN_BRIDGE_SECRET);
  if (!secret) return { ok: false, error: 'bridge_not_configured' };
  const base = trimStr(env.TMS_NUGGETS_API_BASE_URL || 'https://mtss-behavior-log.mrradle.workers.dev').replace(/\/$/, '');
  let resp;
  try {
    resp = await fetch(base + '/api/lantern-bridge/mail/thank-you', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + secret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        idempotency_key: payload.idempotency_key,
      }),
    });
  } catch (_) {
    return { ok: false, error: 'mail_request_failed' };
  }
  let data;
  try {
    data = await resp.json();
  } catch (_) {
    return { ok: false, error: 'mail_bad_response' };
  }
  if (!resp.ok || !data || !data.ok) {
    const parts = ['mail_send_failed'];
    if (data && data.from_source) parts.push(String(data.from_source).slice(0, 40));
    if (data && data.provider_status) parts.push(String(data.provider_status));
    if (data && data.provider_error) parts.push(String(data.provider_error).slice(0, 120));
    else if (data && data.error && data.error !== 'mail_send_failed') parts.push(String(data.error).slice(0, 80));
    return {
      ok: false,
      error: parts.join(':').slice(0, 180),
      provider_status: data && data.provider_status != null ? data.provider_status : null,
      provider_error: data && data.provider_error ? String(data.provider_error).slice(0, 240) : null,
      from_source: data && data.from_source ? String(data.from_source) : null,
    };
  }
  return {
    ok: true,
    provider_message_id: trimStr(data.id || data.provider_message_id) || null,
    idempotent: !!data.idempotent,
  };
}

function buildThankYouEmailContent(opts) {
  const recipientName = trimStr(opts.recipient_display_label) || 'there';
  const studentLabel = trimStr(opts.student_display_label) || 'A Lantern student';
  const message = trimStr(opts.message);
  const subject = 'A Lantern Thank-You from ' + studentLabel;
  const text =
    'Hi ' +
    recipientName +
    ',\n\n' +
    studentLabel +
    ' sent you a thank-you through Lantern:\n\n' +
    message +
    '\n\n— Lantern\n';
  const html =
    '<p>Hi ' +
    escapeHtml(recipientName) +
    ',</p>' +
    '<p><strong>' +
    escapeHtml(studentLabel) +
    '</strong> sent you a thank-you through Lantern:</p>' +
    '<p style="white-space:pre-wrap;">' +
    escapeHtml(message) +
    '</p>' +
    '<p>— Lantern</p>';
  return { subject, text, html };
}

async function findThankYouSendByEventKey(db, eventKey) {
  try {
    return (
      (await db
        .prepare(
          `SELECT id, event_key, mission_id, character_name, student_display_label, tms_staff_id,
                  recipient_display_label, message, send_status, provider_message_id, submission_id,
                  error_code, created_at, sent_at
           FROM lantern_thank_you_sends WHERE event_key = ?`
        )
        .bind(eventKey)
        .first()) || null
    );
  } catch (_) {
    return null;
  }
}

async function loadStudentDisplayLabel(db, account, characterName) {
  const username = trimStr(account && account.username);
  let identityDisplay = '';
  try {
    const sid = trimStr(account && account.mtss_student_id);
    const scn = trimStr(account && account.student_character_name) || trimStr(characterName);
    const row = await db
      .prepare(
        `SELECT COALESCE(
           (SELECT display_name FROM lantern_student_identities WHERE lower(trim(character_name)) = lower(trim(?)) LIMIT 1),
           (SELECT display_name FROM lantern_student_identities WHERE lower(trim(character_name)) = lower(trim(?)) LIMIT 1)
         ) AS identity_display`
      )
      .bind(sid || '__none__', scn || '__none__')
      .first();
    identityDisplay = trimStr(row && row.identity_display);
  } catch (_) {}
  return (
    privacySafeStudentLabel({
      identity_display: identityDisplay,
      display_name: account && account.display_name,
      student_character_name: account && account.student_character_name,
      username,
    }) || trimStr(characterName) || 'A Lantern student'
  );
}

/**
 * Full Thank-You send → audit → completeMissionByEvent (+1). Idempotent per Denver day.
 */
export async function sendThankYouMission(db, env, opts) {
  const account = opts && opts.account;
  const characterName = trimStr(opts && opts.characterName);
  const tokenRaw = trimStr(opts && opts.recipient_token);
  const now = (opts && opts.now) instanceof Date ? opts.now : new Date();
  const day = denverLocalDateYYYYMMDD(now);
  const eventKey = eventKeyThankYou(characterName, day);

  if (!characterName) return { ok: false, error: 'missing_identity', _httpStatus: 403 };
  const role = trimStr(account && account.role).toLowerCase();
  if (role !== 'student') return { ok: false, error: 'students_only', _httpStatus: 403 };

  const parsed = parsePeopleToken(tokenRaw);
  if (!parsed || parsed.person_kind !== 'staff' || !String(parsed.token || '').startsWith('staff_tms:')) {
    return { ok: false, error: 'recipient_invalid', _httpStatus: 400 };
  }
  // Reject free-text / email injection: only staff_tms tokens.
  if (/@/.test(tokenRaw) || /mailto:/i.test(tokenRaw)) {
    return { ok: false, error: 'recipient_invalid', _httpStatus: 400 };
  }

  const msgCheck = validateThankYouMessage(opts && opts.message);
  if (!msgCheck.ok) return { ...msgCheck, _httpStatus: 400 };

  const recipient = await resolveThankYouStaffRecipient(db, parsed.person_key);
  if (!recipient.ok) return { ok: false, error: recipient.error, _httpStatus: 400 };

  const existingSend = await findThankYouSendByEventKey(db, eventKey);
  if (existingSend && String(existingSend.send_status) === 'sent') {
    const completed = await completeMissionByEvent(db, env, {
      missionId: THANK_YOU_MISSION_ID,
      characterName,
      triggerType: 'thank_you_email',
      eventKey,
      sourceRef: existingSend.id,
      cadence: 'daily',
      content: JSON.stringify({
        tms_staff_id: existingSend.tms_staff_id,
        recipient_label: existingSend.recipient_display_label,
      }),
      note: 'Thank a Teacher',
    });
    return {
      ok: true,
      idempotent: true,
      completed: true,
      rewarded: !!(completed && completed.rewarded),
      day,
      timezone: SCHOOL_SCHEDULE_TIMEZONE,
      recipient_label: existingSend.recipient_display_label,
      nuggets: 1,
    };
  }

  const emailRes = await resolveThankYouRecipientEmail(db, env, recipient);
  if (!emailRes.ok) {
    return { ok: false, error: emailRes.error || 'staff_email_missing', _httpStatus: 400 };
  }

  const studentLabel = await loadStudentDisplayLabel(db, account, characterName);
  const mailContent = buildThankYouEmailContent({
    recipient_display_label: recipient.display_label,
    student_display_label: studentLabel,
    message: msgCheck.message,
  });

  const sendId = 'ty_' + eventKey.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 100);
  const createdAt = now.toISOString();

  if (!existingSend) {
    try {
      await db
        .prepare(
          `INSERT INTO lantern_thank_you_sends (
             id, event_key, mission_id, character_name, student_display_label, tms_staff_id,
             recipient_display_label, message, send_status, provider_message_id, submission_id,
             error_code, created_at, sent_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'attempting', NULL, NULL, NULL, ?, NULL)`
        )
        .bind(
          sendId,
          eventKey,
          THANK_YOU_MISSION_ID,
          characterName,
          studentLabel,
          recipient.tms_staff_id,
          recipient.display_label,
          msgCheck.message,
          createdAt
        )
        .run();
    } catch (e) {
      const again = await findThankYouSendByEventKey(db, eventKey);
      if (again && String(again.send_status) === 'sent') {
        return sendThankYouMission(db, env, opts);
      }
      if (again && String(again.send_status) === 'attempting') {
        return { ok: false, error: 'send_in_progress', _httpStatus: 409 };
      }
    }
  } else if (String(existingSend.send_status) === 'attempting') {
    // Prompt #207 — allow retry after a stuck attempting row (prior worker crash / network cut).
    // A prior successful send is already handled above; only block concurrent in-flight attempts briefly.
    const createdMs = Date.parse(String(existingSend.created_at || '')) || 0;
    if (createdMs && Date.now() - createdMs < 60 * 1000) {
      return { ok: false, error: 'send_in_progress', _httpStatus: 409 };
    }
  } else if (String(existingSend.send_status) === 'failed') {
    try {
      await db
        .prepare(
          `UPDATE lantern_thank_you_sends SET send_status = 'attempting', error_code = NULL WHERE event_key = ? AND send_status = 'failed'`
        )
        .bind(eventKey)
        .run();
    } catch (_) {}
  }

  const mail = await sendThankYouEmailViaBridge(env, {
    to: emailRes.email,
    subject: mailContent.subject,
    html: mailContent.html,
    text: mailContent.text,
    idempotency_key: eventKey,
  });

  if (!mail.ok) {
    try {
      await db
        .prepare(
          `UPDATE lantern_thank_you_sends SET send_status = 'failed', error_code = ? WHERE event_key = ? AND send_status != 'sent'`
        )
        .bind(String(mail.error || 'mail_send_failed').slice(0, 180), eventKey)
        .run();
    } catch (_) {}
    return {
      ok: false,
      error: String(mail.error || 'mail_send_failed').slice(0, 180),
      _httpStatus: 502,
      provider_status: mail.provider_status != null ? mail.provider_status : null,
      from_source: mail.from_source || null,
    };
  }

  const sentAt = new Date().toISOString();
  try {
    await db
      .prepare(
        `UPDATE lantern_thank_you_sends
         SET send_status = 'sent', provider_message_id = ?, error_code = NULL, sent_at = ?,
             message = ?, recipient_display_label = ?, student_display_label = ?, tms_staff_id = ?
         WHERE event_key = ?`
      )
      .bind(
        mail.provider_message_id,
        sentAt,
        msgCheck.message,
        recipient.display_label,
        studentLabel,
        recipient.tms_staff_id,
        eventKey
      )
      .run();
  } catch (_) {}

  const completed = await completeMissionByEvent(db, env, {
    missionId: THANK_YOU_MISSION_ID,
    characterName,
    triggerType: 'thank_you_email',
    eventKey,
    sourceRef: sendId,
    cadence: 'daily',
    content: JSON.stringify({
      tms_staff_id: recipient.tms_staff_id,
      recipient_label: recipient.display_label,
    }),
    note: 'Thank a Teacher',
  });

  if (!completed || !completed.ok) {
    return {
      ok: false,
      error: (completed && completed.error) || 'completion_failed',
      _httpStatus: 500,
      mail_accepted: true,
    };
  }

  try {
    await db
      .prepare(`UPDATE lantern_thank_you_sends SET submission_id = ? WHERE event_key = ?`)
      .bind(completed.submission_id || null, eventKey)
      .run();
  } catch (_) {}

  return {
    ok: true,
    idempotent: !!(completed.idempotent || mail.idempotent),
    completed: true,
    rewarded: !!completed.rewarded || !!completed.idempotent,
    day,
    timezone: SCHOOL_SCHEDULE_TIMEZONE,
    recipient_label: recipient.display_label,
    nuggets: 1,
    provider_accepted: true,
  };
}

export { buildThankYouEmailContent };
