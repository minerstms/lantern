/* Semester bulk credentials — client-side CSV parse, match, MonthDDYYYY, print cards.
   DOB and plaintext passwords stay in memory only. Not persisted. */
(function (root) {
  "use strict";

  var MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  var OFFICE_DOMAIN = "trinidad.k12.co.us";
  var MICROSOFT_EXAMPLES = "Clipchamp • Outlook • Student Laptop";
  var GOOGLE_EXAMPLES = "Soundtrap • Gemini • TinkerCAD";
  var PRIVACY_BANNER = "PRIVATE — STUDENT LOGIN INFORMATION";
  var WARN_TURN_IN = "If this is not your sheet, stop reading and turn it in to Mr. Radle immediately.";
  var WARN_NEVER_SHARE = "Never photograph, copy, share, or use another student’s login information.";
  var GOOGLE_SETTINGS_LOCATION = "https://mrradle.us/admin/settings/";
  var GOOGLE_MISSING_MESSAGE = "Google login credential has not been configured. Update it in Geppetto Admin → Daily Work Settings (https://mrradle.us/admin/settings/) before generating login sheets.";
  var savedGoogleUsername = "";
  var savedGooglePassword = "";
  var REQUIRED_HEADERS = ["last name", "first name", "student number", "date of birth"];
  var STATUS = {
    EXACT: "exact_match",
    NAME_MISMATCH: "id_match_name_mismatch",
    NOT_FOUND: "student_not_found",
    DUP_NUMBER: "duplicate_student_number",
    DUP_ROW: "duplicate_input_row",
    INVALID_DOB: "invalid_dob",
    INACTIVE: "inactive_or_not_student"
  };
  var STATUS_LABELS = {
    exact_match: "Exact Match",
    id_match_name_mismatch: "ID Match / Name Mismatch",
    student_not_found: "Student Not Found",
    duplicate_student_number: "Duplicate Student Number",
    duplicate_input_row: "Duplicate Input Row",
    invalid_dob: "Invalid DOB",
    inactive_or_not_student: "Inactive / Not Student"
  };

  function trim(v) {
    return String(v == null ? "" : v).trim();
  }

  function normalizeName(v) {
    return trim(v).replace(/\s+/g, " ").toLowerCase();
  }

  function studentNumberKey(v) {
    return trim(v).toLowerCase();
  }

  function escapeHtml(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isValidYmd(y, m, d) {
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return false;
    if (y < 1995 || y > 2024) return false;
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  /** Parsed calendar date → October022013. Empty if incomplete/invalid. */
  function formatBirthdayCredentialFromParts(y, m, d) {
    if (!isValidYmd(y, m, d)) return "";
    var day2 = d < 10 ? "0" + d : String(d);
    return MONTHS[m - 1] + day2 + String(y);
  }

  /** YYYY-MM-DD → MonthDDYYYY. Empty if invalid. */
  function formatBirthdayCredential(isoDate) {
    var s = trim(isoDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
    var parts = s.split("-");
    return formatBirthdayCredentialFromParts(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10),
      parseInt(parts[2], 10)
    );
  }

  /** Accepts 10/2/2013, 10/02/2013, 2013-10-02. Returns { iso, password } or null. */
  function parseDob(raw) {
    var s = trim(raw);
    if (!s) return null;
    var y;
    var m;
    var d;
    var isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    var usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (isoMatch) {
      y = parseInt(isoMatch[1], 10);
      m = parseInt(isoMatch[2], 10);
      d = parseInt(isoMatch[3], 10);
    } else if (usMatch) {
      m = parseInt(usMatch[1], 10);
      d = parseInt(usMatch[2], 10);
      y = parseInt(usMatch[3], 10);
    } else {
      return null;
    }
    var password = formatBirthdayCredentialFromParts(y, m, d);
    if (!password) return null;
    var mm = m < 10 ? "0" + m : String(m);
    var dd = d < 10 ? "0" + d : String(d);
    return { iso: y + "-" + mm + "-" + dd, password: password };
  }

  function parseCsvLine(line) {
    var out = [];
    var cur = "";
    var inQuotes = false;
    var i;
    for (i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (line.charAt(i + 1) === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function splitCsvLines(text) {
    return String(text || "")
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter(function (line, idx, arr) {
        if (trim(line)) return true;
        return idx < arr.length - 1 && arr.slice(idx + 1).some(function (l) { return trim(l); });
      });
  }

  function normalizeHeader(h) {
    return trim(h).replace(/\s+/g, " ").toLowerCase();
  }

  function validateCsvHeaders(headers) {
    var normalized = (headers || []).map(normalizeHeader);
    var missing = [];
    REQUIRED_HEADERS.forEach(function (need) {
      if (normalized.indexOf(need) === -1) missing.push(need);
    });
    return { ok: missing.length === 0, missing: missing, headers: normalized };
  }

  function parseSemesterCsv(text) {
    var lines = splitCsvLines(text).filter(function (l) { return trim(l); });
    if (!lines.length) {
      return { ok: false, error: "empty_csv", rows: [] };
    }
    var headers = parseCsvLine(lines[0]).map(normalizeHeader);
    var headerCheck = validateCsvHeaders(headers);
    if (!headerCheck.ok) {
      return { ok: false, error: "invalid_headers", missing: headerCheck.missing, rows: [] };
    }
    var idx = {
      last: headers.indexOf("last name"),
      first: headers.indexOf("first name"),
      number: headers.indexOf("student number"),
      dob: headers.indexOf("date of birth")
    };
    var rows = [];
    var r;
    for (r = 1; r < lines.length; r++) {
      var cols = parseCsvLine(lines[r]);
      rows.push({
        rowNumber: r + 1,
        lastName: trim(cols[idx.last]),
        firstName: trim(cols[idx.first]),
        studentNumber: trim(cols[idx.number]),
        dobRaw: trim(cols[idx.dob])
      });
    }
    return { ok: true, rows: rows, headers: headers };
  }

  function rowFingerprint(row) {
    return [
      normalizeName(row.lastName),
      normalizeName(row.firstName),
      studentNumberKey(row.studentNumber),
      trim(row.dobRaw).toLowerCase()
    ].join("|");
  }

  function indexLanternStudents(users) {
    var byNumber = {};
    (users || []).forEach(function (u) {
      var username = trim(u && u.username);
      var rosterId = trim(u && u.mtss_student_id);
      var rec = {
        username: username,
        firstName: trim(u && u.first_name),
        lastName: trim(u && u.last_name),
        displayName: trim(u && u.display_name),
        role: trim(u && u.role).toLowerCase(),
        isActive: u && u.is_active != null ? Number(u.is_active) !== 0 : true,
        mtssStudentId: rosterId
      };
      if (username) byNumber[studentNumberKey(username)] = rec;
      if (rosterId) byNumber[studentNumberKey(rosterId)] = rec;
    });
    return byNumber;
  }

  function namesMatch(row, account) {
    var first = normalizeName(row.firstName);
    var last = normalizeName(row.lastName);
    if (!first || !last) return false;
    if (normalizeName(account.firstName) === first && normalizeName(account.lastName) === last) {
      return true;
    }
    var display = normalizeName(account.displayName);
    return display === first + " " + last || display === last + " " + first;
  }

  function previewSemesterCsv(rows, lanternUsers) {
    var byNumber = indexLanternStudents(lanternUsers);
    var numberCounts = {};
    var fingerprints = {};
    (rows || []).forEach(function (row) {
      var num = studentNumberKey(row.studentNumber);
      if (num) numberCounts[num] = (numberCounts[num] || 0) + 1;
      var fp = rowFingerprint(row);
      fingerprints[fp] = (fingerprints[fp] || 0) + 1;
    });

    var results = (rows || []).map(function (row) {
      var dob = parseDob(row.dobRaw);
      var num = studentNumberKey(row.studentNumber);
      var fp = rowFingerprint(row);
      var status = STATUS.EXACT;
      var account = num ? byNumber[num] : null;
      var password = dob ? dob.password : "";

      if (fingerprints[fp] > 1) {
        status = STATUS.DUP_ROW;
      } else if (num && numberCounts[num] > 1) {
        status = STATUS.DUP_NUMBER;
      } else if (!dob) {
        status = STATUS.INVALID_DOB;
      } else if (!num || !account) {
        status = STATUS.NOT_FOUND;
      } else if (account.role !== "student" || !account.isActive) {
        status = STATUS.INACTIVE;
      } else if (!namesMatch(row, account)) {
        status = STATUS.NAME_MISMATCH;
      }

      var eligible = status === STATUS.EXACT && !!password;
      return {
        rowNumber: row.rowNumber,
        lastName: row.lastName,
        firstName: row.firstName,
        studentNumber: trim(row.studentNumber),
        username: account && account.username ? account.username : trim(row.studentNumber),
        status: status,
        statusLabel: STATUS_LABELS[status] || status,
        eligible: eligible,
        password: eligible ? password : ""
      };
    });

    var totals = {
      totalRows: results.length,
      ready: 0,
      mismatched: 0,
      missing: 0,
      invalid: 0,
      duplicates: 0,
      inactive: 0,
      willUpdate: 0
    };
    results.forEach(function (r) {
      if (r.status === STATUS.EXACT) {
        totals.ready += 1;
        totals.willUpdate += 1;
      } else if (r.status === STATUS.NAME_MISMATCH) totals.mismatched += 1;
      else if (r.status === STATUS.NOT_FOUND) totals.missing += 1;
      else if (r.status === STATUS.INVALID_DOB) totals.invalid += 1;
      else if (r.status === STATUS.DUP_NUMBER || r.status === STATUS.DUP_ROW) totals.duplicates += 1;
      else if (r.status === STATUS.INACTIVE) totals.inactive += 1;
    });

    return { rows: results, totals: totals };
  }

  function confirmationPhrase(n) {
    return "UPDATE " + Number(n || 0) + " STUDENTS";
  }

  function sortAppliedStudents(list) {
    return (list || []).slice().sort(function (a, b) {
      var last = normalizeName(a.lastName).localeCompare(normalizeName(b.lastName));
      if (last) return last;
      var first = normalizeName(a.firstName).localeCompare(normalizeName(b.firstName));
      if (first) return first;
      return studentNumberKey(a.studentNumber).localeCompare(studentNumberKey(b.studentNumber));
    });
  }

  function formatIndexLabel(name, period) {
    name = trim(name);
    period = trim(period);
    if (!name || !/^[1-7]$/.test(period)) return "";
    return name.toUpperCase() + " • PERIOD " + period;
  }

  function setGoogleClassroomCredential(cred) {
    savedGoogleUsername = trim(cred && (cred.googleUsername != null ? cred.googleUsername : cred.loginSheetGoogleUsername));
    savedGooglePassword = trim(cred && (cred.googlePassword != null ? cred.googlePassword : cred.loginSheetGooglePassword));
    return googleClassroomCredential();
  }

  function googleClassroomCredential() {
    return {
      googleUsername: savedGoogleUsername,
      googlePassword: savedGooglePassword,
      configured: !!(savedGoogleUsername && savedGooglePassword)
    };
  }

  function googleCredentialBlockMessage() {
    return GOOGLE_MISSING_MESSAGE;
  }

  function packetStudent(student) {
    var cred = googleClassroomCredential();
    return {
      name: studentDisplayName(student),
      studentId: usernameCopyValue(student),
      password: passwordCopyValue(student),
      grade: trim(student && student.grade),
      period: trim(student && student.period),
      googleUsername: trim(student && student.googleUsername) || cred.googleUsername,
      googlePassword: trim(student && student.googlePassword) || cred.googlePassword
    };
  }

  function indexRailHtml(label) {
    var text = escapeHtml(label || "");
    return (
      '<div class="loginSheetIndexRail" aria-hidden="true">' +
        '<div class="loginSheetIndexEdge loginSheetIndexEdgeTop">' +
          '<span class="loginSheetIndexLabel js-print-index" data-index-edge="top" data-index-rot="0">' + text + "</span>" +
          '<span class="loginSheetIndexLabel js-print-index" data-index-edge="top" data-index-rot="180">' + text + "</span>" +
        "</div>" +
        '<div class="loginSheetIndexEdge loginSheetIndexEdgeBottom">' +
          '<span class="loginSheetIndexLabel js-print-index" data-index-edge="bottom" data-index-rot="0">' + text + "</span>" +
          '<span class="loginSheetIndexLabel js-print-index" data-index-edge="bottom" data-index-rot="180">' + text + "</span>" +
        "</div>" +
        '<div class="loginSheetIndexEdge loginSheetIndexEdgeLeft">' +
          '<span class="loginSheetIndexLabel js-print-index" data-index-edge="left" data-index-rot="90">' + text + "</span>" +
          '<span class="loginSheetIndexLabel js-print-index" data-index-edge="left" data-index-rot="-90">' + text + "</span>" +
        "</div>" +
        '<div class="loginSheetIndexEdge loginSheetIndexEdgeRight">' +
          '<span class="loginSheetIndexLabel js-print-index" data-index-edge="right" data-index-rot="90">' + text + "</span>" +
          '<span class="loginSheetIndexLabel js-print-index" data-index-edge="right" data-index-rot="-90">' + text + "</span>" +
        "</div>" +
      "</div>"
    );
  }

  function coverHalfHtml(name, grade, extraClass, period) {
    return (
      '<div class="loginSheetFoldHalf ' + extraClass + '">' +
        indexRailHtml(formatIndexLabel(name, period)) +
        '<div class="loginSheetFoldBlock' + (extraClass.indexOf("Bottom") >= 0 ? " loginSheetFoldBlockRotated" : "") + '">' +
          '<div class="loginSheetConfidentialHeading">' + escapeHtml(PRIVACY_BANNER) + "</div>" +
          '<div class="loginSheetRow"><span class="loginSheetLabel">Student Name:</span><span class="loginSheetValue">' + escapeHtml(name) + "</span></div>" +
          '<div class="loginSheetRow"><span class="loginSheetLabel">Grade:</span><span class="loginSheetValue">' + escapeHtml(grade) + "</span></div>" +
          '<div class="loginSheetPrivacyLine">' + escapeHtml(WARN_TURN_IN) + "</div>" +
          '<div class="loginSheetPrivacyLine">' + escapeHtml(WARN_NEVER_SHARE) + "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function credRow(title, notes, unHtml, password) {
    return (
      '<section class="loginSheetSection loginSheetLoginRow">' +
        '<div class="loginSheetLoginLeft">' +
          '<h2 class="loginSheetSectionTitle">' + escapeHtml(title) + "</h2>" +
          notes +
        "</div>" +
        '<div class="loginSheetLoginRight">' +
          '<div class="loginSheetCred"><span class="loginSheetLabel">UN:</span>' + unHtml + "</div>" +
          '<div class="loginSheetCred"><span class="loginSheetLabel">PW:</span><span class="loginSheetValue">' + escapeHtml(password) + "</span></div>" +
        "</div>" +
      "</section>"
    );
  }

  function plainUn(value) {
    return '<span class="loginSheetValue">' + escapeHtml(value) + "</span>";
  }

  function microsoftUn(studentId) {
    return (
      '<span class="loginSheetUserRow">' +
        '<span class="loginSheetIdBox">' + escapeHtml(studentId) + "</span>" +
        '<span class="loginSheetDomain">@' + OFFICE_DOMAIN + "</span>" +
      "</span>"
    );
  }

  function siteNotes(lines) {
    return (lines || []).map(function (line) {
      return '<div class="loginSheetSiteNote">' + escapeHtml(line) + "</div>";
    }).join("");
  }

  function buildLoginPacketHtml(student) {
    var s = packetStudent(student);
    var periodRow = /^[1-7]$/.test(s.period)
      ? '<div class="loginSheetRow"><span class="loginSheetLabel">Period:</span><span class="loginSheetValue">' + escapeHtml(s.period) + "</span></div>"
      : "";
    var page1 =
      '<article class="student-login-sheet loginSheetPage1">' +
        '<aside class="loginSheetPage1Header" aria-label="Private warning">' +
          '<div class="loginSheetHeaderBand loginSheetHeaderBandPrivate"><span class="loginSheetHeaderFit">' + escapeHtml(PRIVACY_BANNER) + "</span></div>" +
          '<div class="loginSheetHeaderBand loginSheetHeaderBandWarn"><span class="loginSheetHeaderFit">' + escapeHtml(WARN_TURN_IN) + "</span></div>" +
          '<div class="loginSheetHeaderBand loginSheetHeaderBandWarn"><span class="loginSheetHeaderFit">' + escapeHtml(WARN_NEVER_SHARE) + "</span></div>" +
        "</aside>" +
        '<section class="loginSheetSection loginSheetInfoSection">' +
          '<h2 class="loginSheetSectionTitle">STUDENT INFORMATION</h2>' +
          '<div class="loginSheetRow"><span class="loginSheetLabel">Student Name:</span><span class="loginSheetValue">' + escapeHtml(s.name) + "</span></div>" +
          '<div class="loginSheetRow"><span class="loginSheetLabel">Grade:</span><span class="loginSheetValue">' + escapeHtml(s.grade) + "</span></div>" +
          '<div class="loginSheetRow"><span class="loginSheetLabel">Student ID:</span><span class="loginSheetValue">' + escapeHtml(s.studentId) + "</span></div>" +
          periodRow +
        "</section>" +
        credRow("STEM LAB COMPUTER", siteNotes(["Select “Other user” if your account isn’t shown."]), plainUn(s.studentId), s.password) +
        credRow("STEM WEBSITES", siteNotes(["mrradle.us", "tmslantern.org"]), plainUn(s.studentId), s.password) +
        credRow("MICROSOFT / SCHOOL ACCOUNT", siteNotes([MICROSOFT_EXAMPLES, "Office.com"]), microsoftUn(s.studentId), s.password) +
        credRow("GOOGLE / GOOGLE SIGN-IN", siteNotes([GOOGLE_EXAMPLES, "google.com"]), plainUn(s.googleUsername), s.googlePassword) +
        '<aside class="loginSheetPage1Footer" aria-label="Private reminder">' +
          '<div class="loginSheetFooterTitle">' + escapeHtml(PRIVACY_BANNER) + "</div>" +
        "</aside>" +
      "</article>";
    var page2 =
      '<article class="student-login-sheet loginSheetFoldCover" aria-label="Privacy fold cover">' +
        coverHalfHtml(s.name, s.grade, "loginSheetFoldHalfTop", s.period) +
        coverHalfHtml(s.name, s.grade, "loginSheetFoldHalfBottom", s.period) +
      "</article>";
    return page1 + page2;
  }

  function buildLoginCardHtml(studentId, password) {
    return buildLoginPacketHtml({ studentNumber: studentId, username: studentId, password: password, firstName: "", lastName: "" });
  }

  function buildBatchPrintHtml(students) {
    if (!googleClassroomCredential().configured) return "";
    return sortAppliedStudents(students).map(function (s) {
      return buildLoginPacketHtml(s);
    }).join("");
  }

  function studentLoginLocalPart(raw) {
    var s = trim(raw);
    var at = s.indexOf("@");
    if (at >= 0) s = s.slice(0, at);
    s = s.replace(/[^A-Za-z0-9]/g, "");
    if (s.length > 6) s = s.slice(0, 6);
    return s;
  }

  function studentDisplayName(row) {
    var first = trim(row && row.firstName);
    var last = trim(row && row.lastName);
    if (first && last) return first + " " + last;
    return first || last || trim(row && row.displayName) || "Student";
  }

  function usernameCopyValue(row) {
    return studentLoginLocalPart((row && (row.studentNumber || row.username)) || "");
  }

  function passwordCopyValue(row) {
    return trim(row && row.password);
  }

  function exportLanSchoolStudents(students) {
    return sortAppliedStudents(students).map(function (row) {
      return {
        name: studentDisplayName(row),
        studentId: usernameCopyValue(row),
        password: passwordCopyValue(row)
      };
    }).filter(function (row) {
      return row.studentId && row.password;
    });
  }

  function fallbackCopyValue(value, doc) {
    var d = doc || (typeof document !== "undefined" ? document : null);
    if (!d || !d.body) return { ok: false, method: "unavailable" };
    var ta = d.createElement("textarea");
    ta.value = String(value == null ? "" : value);
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    d.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = false;
    try { ok = d.execCommand("copy"); } catch (e) { ok = false; }
    d.body.removeChild(ta);
    return { ok: !!ok, method: "execCommand" };
  }

  function copyTextValue(value, doc) {
    var text = String(value == null ? "" : value);
    var nav = typeof navigator !== "undefined" ? navigator : null;
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === "function") {
      return nav.clipboard.writeText(text).then(function () {
        return { ok: true, method: "clipboard" };
      }).catch(function () {
        return fallbackCopyValue(text, doc);
      });
    }
    return Promise.resolve(fallbackCopyValue(text, doc));
  }

  function pdfEscape(s) {
    return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  function pdfSafe(s) {
    return String(s == null ? "" : s).replace(/[^\x20-\x7E]/g, "?");
  }

  function buildLoginSheetsPdfBytes(students) {
    if (!googleClassroomCredential().configured) return new Uint8Array(0);
    var list = sortAppliedStudents(students).map(packetStudent);
    var pageW = 612;
    var pageH = 792;
    var objects = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    var pageRefs = [];
    var objId = 5;
    function line(stream, font, size, x, y, text) {
      stream.push("BT /" + font + " " + size + " Tf " + x + " " + y + " Td (" + pdfEscape(pdfSafe(text)) + ") Tj ET");
    }
    function fillRect(stream, r, g, b, x, y, w, h) {
      stream.push(r + " " + g + " " + b + " rg " + x + " " + y + " " + w + " " + h + " re f");
    }
    function strokeRect(stream, r, g, b, x, y, w, h, width) {
      stream.push((width || 1.5) + " w " + r + " " + g + " " + b + " RG " + x + " " + y + " " + w + " " + h + " re S");
    }
    function credBox(stream, y, title, notes, un, pw, boxedId) {
      strokeRect(stream, 0.184, 0.435, 0.678, 36, y, 540, 86);
      stream.push("0.5 w 0.478 0.541 0.604 RG 241 " + (y + 8) + " 0 70 m 241 " + (y + 78) + " l S");
      line(stream, "F1", 12, 48, y + 64, title);
      var i;
      for (i = 0; i < notes.length; i++) line(stream, "F2", 9, 48, y + 48 - (i * 12), notes[i]);
      line(stream, "F1", 11, 252, y + 52, "UN:");
      if (boxedId) {
        strokeRect(stream, 0.067, 0.067, 0.067, 278, y + 44, 92, 20, 2);
        line(stream, "F1", 12, 286, y + 50, boxedId);
        line(stream, "F1", 11, 376, y + 50, "@trinidad.k12.co.us");
      } else {
        line(stream, "F1", 12, 278, y + 50, un);
      }
      line(stream, "F1", 11, 252, y + 24, "PW:");
      line(stream, "F1", 12, 278, y + 22, pw);
    }
    function page1Stream(item) {
      var stream = [];
      fillRect(stream, 0.043, 0.122, 0.267, 36, 736, 540, 32);
      stream.push("1 1 1 rg");
      line(stream, "F1", 14, 54, 746, PRIVACY_BANNER);
      fillRect(stream, 0.459, 0.698, 0.867, 36, 700, 540, 32);
      stream.push("0 0 0 rg");
      line(stream, "F2", 8, 48, 720, WARN_TURN_IN);
      line(stream, "F2", 8, 48, 706, WARN_NEVER_SHARE);
      strokeRect(stream, 0.184, 0.435, 0.678, 36, 618, 540, 74);
      line(stream, "F1", 13, 220, 670, "STUDENT INFORMATION");
      line(stream, "F1", 11, 54, 650, "Student Name: " + item.name);
      line(stream, "F1", 11, 54, 634, "Grade: " + (item.grade || ""));
      line(stream, "F1", 11, 300, 650, "Student ID: " + item.studentId);
      if (/^[1-7]$/.test(item.period)) line(stream, "F1", 11, 300, 634, "Period: " + item.period);
      credBox(stream, 520, "STEM LAB COMPUTER", ["Select Other user if your account isn't shown."], item.studentId, item.password);
      credBox(stream, 426, "STEM WEBSITES", ["mrradle.us", "tmslantern.org"], item.studentId, item.password);
      credBox(stream, 332, "MICROSOFT / SCHOOL ACCOUNT", [MICROSOFT_EXAMPLES, "Office.com"], item.studentId + "@trinidad.k12.co.us", item.password, item.studentId);
      credBox(stream, 238, "GOOGLE / GOOGLE SIGN-IN", [GOOGLE_EXAMPLES, "google.com"], item.googleUsername, item.googlePassword);
      fillRect(stream, 0.043, 0.122, 0.267, 36, 36, 540, 28);
      stream.push("1 1 1 rg");
      line(stream, "F1", 12, 54, 46, PRIVACY_BANNER);
      return stream.join("\n");
    }
    function privacyBlock(stream, y, item, rotated) {
      var index = formatIndexLabel(item.name, item.period);
      strokeRect(stream, 0.067, 0.067, 0.067, 90, y, 432, 150, 2.5);
      line(stream, "F1", 13, 120, y + 118, PRIVACY_BANNER);
      line(stream, "F1", 11, 120, y + 96, "Student Name: " + item.name);
      line(stream, "F1", 11, 120, y + 78, "Grade: " + (item.grade || ""));
      line(stream, "F2", 8, 120, y + 54, WARN_TURN_IN);
      line(stream, "F2", 8, 120, y + 40, WARN_NEVER_SHARE);
      if (index) {
        line(stream, "F1", 8, 120, y + 16, index);
        line(stream, "F1", 8, 360, y + 16, index);
      }
      return rotated;
    }
    function page2Stream(item) {
      var stream = [];
      privacyBlock(stream, 420, item, false);
      stream.push("q");
      stream.push("1 0 0 1 306 198 cm");
      stream.push("-1 0 0 -1 0 0 cm");
      stream.push("1 0 0 1 -306 -198 cm");
      privacyBlock(stream, 120, item, true);
      stream.push("Q");
      return stream.join("\n");
    }
    var i;
    if (!list.length) return new Uint8Array(0);
    for (i = 0; i < list.length; i++) {
      var item = list[i];
      var p1 = objId;
      var c1 = objId + 1;
      var s1 = page1Stream(item);
      objects[p1] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pageW + " " + pageH + "] /Contents " + c1 + " 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>";
      objects[c1] = "<< /Length " + s1.length + " >>\nstream\n" + s1 + "\nendstream";
      pageRefs.push(p1 + " 0 R");
      objId += 2;
      var p2 = objId;
      var c2 = objId + 1;
      var s2 = page2Stream(item);
      objects[p2] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pageW + " " + pageH + "] /Contents " + c2 + " 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>";
      objects[c2] = "<< /Length " + s2.length + " >>\nstream\n" + s2 + "\nendstream";
      pageRefs.push(p2 + " 0 R");
      objId += 2;
    }
    objects[2] = "<< /Type /Pages /Kids [" + pageRefs.join(" ") + "] /Count " + pageRefs.length + " >>";

    var chunks = ["%PDF-1.4\n"];
    var offsets = [0];
    for (i = 1; i < objects.length; i++) {
      if (!objects[i]) continue;
      offsets[i] = chunks.join("").length;
      chunks.push(i + " 0 obj\n" + objects[i] + "\nendobj\n");
    }
    var xrefAt = chunks.join("").length;
    var xref = "xref\n0 " + objects.length + "\n0000000000 65535 f \n";
    for (i = 1; i < objects.length; i++) {
      var off = offsets[i] || 0;
      xref += ("0000000000" + off).slice(-10) + " 00000 n \n";
    }
    chunks.push(xref);
    chunks.push("trailer\n<< /Size " + objects.length + " /Root 1 0 R >>\nstartxref\n" + xrefAt + "\n%%EOF\n");
    return new TextEncoder().encode(chunks.join(""));
  }

  function createLanSchoolResultsState(students) {
    return {
      rows: exportLanSchoolStudents(students).map(function (s) {
        return {
          name: s.name,
          studentId: s.studentId,
          password: s.password,
          done: false,
          open: false
        };
      }),
      query: "",
      filter: "all"
    };
  }

  function rowMatchesSearch(row, query) {
    var q = normalizeName(query);
    if (!q) return true;
    var name = normalizeName(row && row.name);
    var id = studentNumberKey(row && row.studentId);
    if (name.indexOf(q) !== -1 || id.indexOf(q) !== -1) return true;
    var parts = name.split(" ").filter(Boolean);
    return parts.some(function (part) { return part.indexOf(q) === 0 || part.indexOf(q) !== -1; });
  }

  function visibleLanSchoolRows(state) {
    var rows = ((state && state.rows) || []).filter(function (row) {
      if (!rowMatchesSearch(row, state.query)) return false;
      if (state.filter === "remaining" && row.done) return false;
      if (state.filter === "done" && !row.done) return false;
      return true;
    });
    var remaining = rows.filter(function (r) { return !r.done; });
    var done = rows.filter(function (r) { return r.done; });
    return remaining.concat(done);
  }

  function lanSchoolProgress(state) {
    var total = ((state && state.rows) || []).length;
    var done = ((state && state.rows) || []).filter(function (r) { return r.done; }).length;
    return { done: done, total: total, label: done + " of " + total + " Done" };
  }

  function toggleLanSchoolRow(state, studentId) {
    var id = String(studentId || "");
    (state.rows || []).forEach(function (r) {
      if (String(r.studentId) === id) r.open = !r.open;
    });
    return state;
  }

  function markLanSchoolRowDone(state, studentId) {
    var id = String(studentId || "");
    (state.rows || []).forEach(function (r) {
      if (String(r.studentId) === id) {
        r.done = true;
        r.open = false;
      }
    });
    return state;
  }

  function currentLanSchoolStudentId(state) {
    var next = visibleLanSchoolRows(state).filter(function (r) { return !r.done; })[0];
    return next ? next.studentId : "";
  }

  function buildLanSchoolResultRowHtml(row, isCurrent) {
    var status = row.done ? "Done" : "Remaining";
    var cls = "lanschoolRow" + (row.done ? " is-done" : "") + (row.open ? " is-open" : "") + (isCurrent ? " is-current" : "");
    return (
      '<div class="' + cls + '" data-student-id="' + escapeHtml(row.studentId) + '" data-done="' + (row.done ? "1" : "0") + '">' +
        '<button type="button" class="lanschoolRowHd" data-toggle-id="' + escapeHtml(row.studentId) + '" aria-expanded="' + (row.open ? "true" : "false") + '">' +
          '<span class="lanschoolName">' + escapeHtml(row.name) + "</span>" +
          '<span class="lanschoolId">' + escapeHtml(row.studentId) + "</span>" +
          '<span class="lanschoolStatus">' + status + "</span>" +
        "</button>" +
        '<div class="lanschoolRowBd"' + (row.open ? "" : " hidden") + ">" +
          '<div class="lanschoolLab">USERNAME</div>' +
          '<button type="button" class="lanschoolCopyBtn" data-copy-kind="username" data-copy-value="' + escapeHtml(row.studentId) + '">' + escapeHtml(row.studentId) + "</button>" +
          '<div class="lanschoolLab">PASSWORD</div>' +
          '<button type="button" class="lanschoolCopyBtn" data-copy-kind="password" data-copy-value="' + escapeHtml(row.password) + '">' + escapeHtml(row.password) + "</button>" +
          '<div><button type="button" class="lanschoolDoneBtn" data-done-id="' + escapeHtml(row.studentId) + '">Mark Done</button></div>' +
        "</div>" +
      "</div>"
    );
  }

  function buildLanSchoolResultsChromeHtml(state) {
    var progress = lanSchoolProgress(state);
    var currentId = currentLanSchoolStudentId(state);
    var rows = visibleLanSchoolRows(state).map(function (row) {
      return buildLanSchoolResultRowHtml(row, row.studentId === currentId);
    }).join("");
    return (
      '<div class="lanschoolToolbar">' +
        '<label class="lanschoolSearchLabel" for="lanschoolSearch">Search</label>' +
        '<input id="lanschoolSearch" class="lanschoolSearch" type="search" autocomplete="off" placeholder="Name or Student ID" value="' + escapeHtml(state.query || "") + '" />' +
        '<div class="lanschoolFilters" role="group" aria-label="Status filter">' +
          '<button type="button" class="lanschoolFilterBtn' + (state.filter === "all" ? " is-on" : "") + '" data-filter="all">All</button>' +
          '<button type="button" class="lanschoolFilterBtn' + (state.filter === "remaining" ? " is-on" : "") + '" data-filter="remaining">Remaining</button>' +
          '<button type="button" class="lanschoolFilterBtn' + (state.filter === "done" ? " is-on" : "") + '" data-filter="done">Done</button>' +
        "</div>" +
        '<div class="lanschoolProgress" id="lanschoolProgress">' + escapeHtml(progress.label) + "</div>" +
      "</div>" +
      '<div class="lanschoolList" id="lanschoolList">' + rows + "</div>"
    );
  }

  function bindLanSchoolResults(container, state, copyFn) {
    var copy = copyFn || copyTextValue;
    function paint() {
      container.innerHTML = buildLanSchoolResultsChromeHtml(state);
    }
    container.addEventListener("input", function (ev) {
      if (ev.target && ev.target.id === "lanschoolSearch") {
        state.query = ev.target.value || "";
        paint();
        var search = container.querySelector("#lanschoolSearch");
        if (search) {
          search.focus();
          var n = search.value.length;
          try { search.setSelectionRange(n, n); } catch (e) {}
        }
      }
    });
    container.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var filterBtn = t.closest(".lanschoolFilterBtn");
      if (filterBtn) {
        state.filter = filterBtn.getAttribute("data-filter") || "all";
        paint();
        return;
      }
      var copyBtn = t.closest(".lanschoolCopyBtn");
      if (copyBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        var value = copyBtn.getAttribute("data-copy-value") || "";
        var kind = copyBtn.getAttribute("data-copy-kind") || "";
        if (kind === "username") value = usernameCopyValue({ studentNumber: value });
        copy(value).then(function () {
          var prior = copyBtn.getAttribute("data-copy-value") || copyBtn.textContent;
          copyBtn.classList.add("is-copied");
          copyBtn.textContent = "COPIED \u2713";
          setTimeout(function () {
            copyBtn.classList.remove("is-copied");
            copyBtn.textContent = prior;
          }, 1200);
        });
        return;
      }
      var doneBtn = t.closest(".lanschoolDoneBtn");
      if (doneBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        markLanSchoolRowDone(state, doneBtn.getAttribute("data-done-id"));
        paint();
        return;
      }
      var hd = t.closest(".lanschoolRowHd");
      if (hd) {
        toggleLanSchoolRow(state, hd.getAttribute("data-toggle-id"));
        paint();
      }
    });
    paint();
    return {
      getState: function () { return state; },
      render: paint
    };
  }

  function mountLanSchoolResults(container, students) {
    if (!container) return null;
    var state = createLanSchoolResultsState(students);
    return bindLanSchoolResults(container, state);
  }

  function buildLanSchoolSetupTableHtml(students) {
    return buildLanSchoolResultsChromeHtml(createLanSchoolResultsState(students));
  }

  function buildLanSchoolSetupFileHtml(students) {
    var state = createLanSchoolResultsState(students);
    var dataJson = JSON.stringify(state.rows.map(function (r) {
      return { name: r.name, studentId: r.studentId, password: r.password };
    })).replace(/</g, "\\u003c");
    var chrome = buildLanSchoolResultsChromeHtml(state);
    return "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"/>" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>" +
      "<title>STEM LanSchool Setup</title>" +
      "<style>" +
      "body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:20px;background:#0f1b33;color:#eaf0ff;}" +
      "h1{font-size:28px;margin:0 0 8px;} .hint{opacity:.85;margin:0 0 16px;}" +
      ".lanschoolToolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px;}" +
      ".lanschoolSearch{flex:1 1 180px;min-height:42px;padding:8px 10px;font-size:18px;}" +
      ".lanschoolFilterBtn{padding:8px 12px;font-weight:800;cursor:pointer;}" +
      ".lanschoolFilterBtn.is-on{outline:2px solid #5aa7ff;}" +
      ".lanschoolProgress{font-weight:800;}" +
      ".lanschoolRow{border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:0;margin:0 0 10px;background:#132038;overflow:hidden;}" +
      ".lanschoolRow.is-current{outline:3px solid #5aa7ff;}" +
      ".lanschoolRow.is-done{background:#163522;}" +
      ".lanschoolRowHd{display:flex;flex-wrap:wrap;gap:10px;align-items:center;width:100%;text-align:left;background:transparent;border:0;color:#eaf0ff;padding:12px 14px;cursor:pointer;font:inherit;}" +
      ".lanschoolName{font-size:20px;font-weight:800;flex:1 1 140px;}" +
      ".lanschoolId,.lanschoolStatus{font-weight:800;}" +
      ".lanschoolRowBd{padding:0 14px 14px;}" +
      ".lanschoolLab{font-size:14px;font-weight:800;margin:8px 0 4px;opacity:.8;}" +
      ".lanschoolCopyBtn{display:inline-flex;align-items:center;min-height:42px;min-width:8em;padding:8px 14px;border:2px solid #eaf0ff;background:#fff;color:#111;font-size:20px;font-weight:800;cursor:pointer;}" +
      ".lanschoolCopyBtn.is-copied{background:#38d07c;border-color:#38d07c;}" +
      ".lanschoolDoneBtn{margin-top:12px;padding:8px 12px;font-weight:800;cursor:pointer;}" +
      "</style></head><body>" +
      "<h1>LanSchool Setup</h1>" +
      "<p class=\"hint\">Offline file. Search, open a row, copy Student ID then password, Mark Done. Credentials stay on this computer.</p>" +
      "<div id=\"root\">" + chrome + "</div>" +
      "<script>var RAW=" + dataJson + ";" +
      "var state={rows:RAW.map(function(s){return{name:s.name,studentId:s.studentId,password:s.password,done:false,open:false};}),query:'',filter:'all'};" +
      "function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');}" +
      "function norm(v){return String(v||'').trim().replace(/\\s+/g,' ').toLowerCase();}" +
      "function matchRow(r,q){q=norm(q);if(!q)return true;return norm(r.name).indexOf(q)!==-1||String(r.studentId).toLowerCase().indexOf(q)!==-1;}" +
      "function visible(){var rows=state.rows.filter(function(r){if(!matchRow(r,state.query))return false;if(state.filter==='remaining'&&r.done)return false;if(state.filter==='done'&&!r.done)return false;return true;});return rows.filter(function(r){return !r.done;}).concat(rows.filter(function(r){return r.done;}));}" +
      "function progress(){var y=state.rows.length,x=state.rows.filter(function(r){return r.done;}).length;return x+' of '+y+' Done';}" +
      "function currentId(){var n=visible().filter(function(r){return !r.done;})[0];return n?n.studentId:'';}" +
      "function rowHtml(r,cur){var st=r.done?'Done':'Remaining';var cls='lanschoolRow'+(r.done?' is-done':'')+(r.open?' is-open':'')+(cur?' is-current':'');return '<div class=\"'+cls+'\" data-student-id=\"'+esc(r.studentId)+'\"><button type=\"button\" class=\"lanschoolRowHd\" data-toggle-id=\"'+esc(r.studentId)+'\" aria-expanded=\"'+(r.open?'true':'false')+'\"><span class=\"lanschoolName\">'+esc(r.name)+'</span><span class=\"lanschoolId\">'+esc(r.studentId)+'</span><span class=\"lanschoolStatus\">'+st+'</span></button><div class=\"lanschoolRowBd\"'+(r.open?'':' hidden')+'><div class=\"lanschoolLab\">USERNAME</div><button type=\"button\" class=\"lanschoolCopyBtn\" data-copy-kind=\"username\" data-copy-value=\"'+esc(r.studentId)+'\">'+esc(r.studentId)+'</button><div class=\"lanschoolLab\">PASSWORD</div><button type=\"button\" class=\"lanschoolCopyBtn\" data-copy-kind=\"password\" data-copy-value=\"'+esc(r.password)+'\">'+esc(r.password)+'</button><div><button type=\"button\" class=\"lanschoolDoneBtn\" data-done-id=\"'+esc(r.studentId)+'\">Mark Done</button></div></div></div>';}" +
      "function paint(){var cur=currentId();var html='<div class=\"lanschoolToolbar\"><label for=\"lanschoolSearch\">Search</label><input id=\"lanschoolSearch\" class=\"lanschoolSearch\" type=\"search\" value=\"'+esc(state.query)+'\" placeholder=\"Name or Student ID\" /><div class=\"lanschoolFilters\"><button type=\"button\" class=\"lanschoolFilterBtn'+(state.filter==='all'?' is-on':'')+'\" data-filter=\"all\">All</button><button type=\"button\" class=\"lanschoolFilterBtn'+(state.filter==='remaining'?' is-on':'')+'\" data-filter=\"remaining\">Remaining</button><button type=\"button\" class=\"lanschoolFilterBtn'+(state.filter==='done'?' is-on':'')+'\" data-filter=\"done\">Done</button></div><div class=\"lanschoolProgress\">'+esc(progress())+'</div></div><div id=\"lanschoolList\">'+visible().map(function(r){return rowHtml(r,r.studentId===cur);}).join('')+'</div>';document.getElementById('root').innerHTML=html;}" +
      "function copyVal(v){v=String(v||'');if(navigator.clipboard&&navigator.clipboard.writeText){return navigator.clipboard.writeText(v).catch(function(){fb(v);});}return Promise.resolve(fb(v));}" +
      "function fb(v){var t=document.createElement('textarea');t.value=v;t.setAttribute('readonly','');t.style.position='fixed';t.style.left='-9999px';document.body.appendChild(t);t.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(t);}" +
      "var root=document.getElementById('root');" +
      "root.addEventListener('input',function(e){if(e.target&&e.target.id==='lanschoolSearch'){state.query=e.target.value||'';paint();var s=document.getElementById('lanschoolSearch');if(s){s.focus();try{s.setSelectionRange(s.value.length,s.value.length);}catch(err){}}}});" +
      "root.addEventListener('click',function(e){var t=e.target;if(!t.closest)return;var f=t.closest('.lanschoolFilterBtn');if(f){state.filter=f.getAttribute('data-filter')||'all';paint();return;}var c=t.closest('.lanschoolCopyBtn');if(c){e.preventDefault();var v=c.getAttribute('data-copy-value')||'';copyVal(v);var prior=v;c.classList.add('is-copied');c.textContent='COPIED \\u2713';setTimeout(function(){c.classList.remove('is-copied');c.textContent=prior;},1200);return;}var d=t.closest('.lanschoolDoneBtn');if(d){var id=d.getAttribute('data-done-id');state.rows.forEach(function(r){if(r.studentId===id){r.done=true;r.open=false;}});paint();return;}var h=t.closest('.lanschoolRowHd');if(h){var tid=h.getAttribute('data-toggle-id');state.rows.forEach(function(r){if(r.studentId===tid)r.open=!r.open;});paint();}});" +
      "paint();" +
      "</script></body></html>";
  }

  function downloadBlob(filename, blob) {
    var d = typeof document !== "undefined" ? document : null;
    if (!d) return false;
    var url = URL.createObjectURL(blob);
    var a = d.createElement("a");
    a.href = url;
    a.download = filename;
    d.body.appendChild(a);
    a.click();
    d.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    return true;
  }

  var api = {
    MONTHS: MONTHS,
    OFFICE_DOMAIN: OFFICE_DOMAIN,
    GOOGLE_SETTINGS_LOCATION: GOOGLE_SETTINGS_LOCATION,
    MICROSOFT_EXAMPLES: MICROSOFT_EXAMPLES,
    GOOGLE_EXAMPLES: GOOGLE_EXAMPLES,
    PRIVACY_BANNER: PRIVACY_BANNER,
    WARN_TURN_IN: WARN_TURN_IN,
    WARN_NEVER_SHARE: WARN_NEVER_SHARE,
    REQUIRED_HEADERS: REQUIRED_HEADERS,
    STATUS: STATUS,
    STATUS_LABELS: STATUS_LABELS,
    trim: trim,
    normalizeName: normalizeName,
    formatBirthdayCredential: formatBirthdayCredential,
    parseDob: parseDob,
    parseSemesterCsv: parseSemesterCsv,
    validateCsvHeaders: validateCsvHeaders,
    previewSemesterCsv: previewSemesterCsv,
    confirmationPhrase: confirmationPhrase,
    sortAppliedStudents: sortAppliedStudents,
    setGoogleClassroomCredential: setGoogleClassroomCredential,
    googleClassroomCredential: googleClassroomCredential,
    googleCredentialBlockMessage: googleCredentialBlockMessage,
    buildLoginCardHtml: buildLoginCardHtml,
    buildLoginPacketHtml: buildLoginPacketHtml,
    buildBatchPrintHtml: buildBatchPrintHtml,
    studentLoginLocalPart: studentLoginLocalPart,
    studentDisplayName: studentDisplayName,
    usernameCopyValue: usernameCopyValue,
    passwordCopyValue: passwordCopyValue,
    exportLanSchoolStudents: exportLanSchoolStudents,
    copyTextValue: copyTextValue,
    fallbackCopyValue: fallbackCopyValue,
    buildLoginSheetsPdfBytes: buildLoginSheetsPdfBytes,
    buildLanSchoolSetupFileHtml: buildLanSchoolSetupFileHtml,
    buildLanSchoolSetupTableHtml: buildLanSchoolSetupTableHtml,
    createLanSchoolResultsState: createLanSchoolResultsState,
    rowMatchesSearch: rowMatchesSearch,
    visibleLanSchoolRows: visibleLanSchoolRows,
    lanSchoolProgress: lanSchoolProgress,
    toggleLanSchoolRow: toggleLanSchoolRow,
    markLanSchoolRowDone: markLanSchoolRowDone,
    currentLanSchoolStudentId: currentLanSchoolStudentId,
    buildLanSchoolResultRowHtml: buildLanSchoolResultRowHtml,
    buildLanSchoolResultsChromeHtml: buildLanSchoolResultsChromeHtml,
    mountLanSchoolResults: mountLanSchoolResults,
    downloadBlob: downloadBlob,
    escapeHtml: escapeHtml
  };

  root.LanternSemesterCredentials = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
