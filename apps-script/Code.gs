/**
 * ============================================================
 *  Code.gs — Google Apps Script Web App (read + write backend)
 * ------------------------------------------------------------
 *  Lets the Exam Prep Tracker store & read all your data in a
 *  Google Sheet. The tabs (StudyLog, Mocks, Settings) are created
 *  automatically — just start with a blank spreadsheet.
 *
 *  SETUP (one time, ~2 min)
 *  1. Create a blank Google Sheet.
 *  2. Extensions ▸ Apps Script. Delete any code, paste this whole
 *     file, and Save.
 *  3. Deploy ▸ New deployment ▸ type "Web app".
 *       - Execute as:      Me
 *       - Who has access:  Anyone
 *     Authorise when prompted.
 *  4. Copy the /exec URL. In the app: ⚙ Settings ▸ "Google Sheet",
 *     paste the URL, Test connection, Save.
 * ============================================================
 */

var STUDY = 'StudyLog';
var MOCK  = 'Mocks';
var SET   = 'Settings';
var STUDY_HEAD = ['id', 'Date', 'Subject', 'Hours'];
var MOCK_HEAD  = ['id', 'Date', 'Name', 'Quant', 'Reasoning', 'English', 'GA', 'Total', 'Cutoff'];

function doGet(e) {
  return json({
    study: readTab(STUDY, STUDY_HEAD),
    mocks: readTab(MOCK, MOCK_HEAD),
    settings: readSettings(),
  });
}

function doPost(e) {
  var res = { ok: true };
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'addStudy':     appendRow(STUDY, STUDY_HEAD, body.entry); break;
      case 'addMock':      appendRow(MOCK,  MOCK_HEAD,  body.entry); break;
      case 'deleteStudy':  deleteById(STUDY, STUDY_HEAD, body.id);   break;
      case 'deleteMock':   deleteById(MOCK,  MOCK_HEAD,  body.id);   break;
      case 'saveSettings': writeSettings(body.settings || {});       break;
      case 'clearAll':     clearData(STUDY, STUDY_HEAD); clearData(MOCK, MOCK_HEAD); break;
      case 'import':
        (body.study || []).forEach(function (r) { appendRow(STUDY, STUDY_HEAD, r); });
        (body.mocks || []).forEach(function (r) { appendRow(MOCK,  MOCK_HEAD,  r); });
        break;
      default: res = { ok: false, error: 'unknown action: ' + body.action };
    }
  } catch (err) { res = { ok: false, error: String(err) }; }
  return json(res);
}

// ---------- helpers ----------
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function tab(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); }
  else if (sh.getLastRow() === 0) { sh.appendRow(head); }
  return sh;
}

function readTab(name, head) {
  var sh = tab(name, head);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var o = {}, blank = true;
    for (var c = 0; c < headers.length; c++) {
      var v = values[r][c];
      if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      o[headers[c]] = v;
      if (v !== '' && v != null) blank = false;
    }
    if (!blank) rows.push(o);
  }
  return rows;
}

function appendRow(name, head, entry) {
  if (!entry) return;
  var sh = tab(name, head);
  var row = head.map(function (h) {
    if (entry[h] != null) return entry[h];
    var lk = h.toLowerCase();
    return entry[lk] != null ? entry[lk] : '';
  });
  sh.appendRow(row);
}

function deleteById(name, head, id) {
  var sh = tab(name, head);
  var values = sh.getDataRange().getValues();
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][0]) === String(id)) sh.deleteRow(r + 1);
  }
}

function clearData(name, head) {
  var sh = tab(name, head);
  var last = sh.getLastRow();
  if (last > 1) sh.deleteRows(2, last - 1);
}

function readSettings() {
  var sh = tab(SET, ['Key', 'Value']);
  var values = sh.getDataRange().getValues();
  var o = {};
  for (var r = 1; r < values.length; r++) {
    var k = String(values[r][0]).trim();
    if (!k) continue;
    try { o[k] = JSON.parse(values[r][1]); } catch (e) { o[k] = values[r][1]; }
  }
  return o;
}

function writeSettings(obj) {
  var sh = tab(SET, ['Key', 'Value']);
  var values = sh.getDataRange().getValues();
  var idx = {};
  for (var r = 1; r < values.length; r++) idx[String(values[r][0]).trim()] = r + 1;
  Object.keys(obj).forEach(function (k) {
    var val = JSON.stringify(obj[k]);
    if (idx[k]) sh.getRange(idx[k], 2).setValue(val);
    else sh.appendRow([k, val]);
  });
}
