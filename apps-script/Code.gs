/**
 * ============================================================
 *  Code.gs — Google Apps Script Web App
 * ------------------------------------------------------------
 *  Serves your Google Sheet as JSON so the dashboard can read
 *  it directly from any device — no API key, no CORS problems.
 *
 *  SETUP
 *  1. Create a Google Sheet with two tabs (see columns below).
 *  2. Extensions ▸ Apps Script.  Paste this whole file.
 *  3. Set the two tab names below if they differ.
 *  4. Deploy ▸ New deployment ▸ type "Web app".
 *       - Execute as:  Me
 *       - Who has access:  Anyone
 *  5. Copy the /exec URL into js/config.js -> APPS_SCRIPT_URL
 *     and set DATA_SOURCE = 'appsscript'.
 *
 *  Expected tabs / columns:
 *    StudyLog : Date | Subject | Hours
 *    Mocks    : Date | Name | Quant | Reasoning | English | GA | Cutoff
 *               (a "Total" column is optional — it is auto-summed if blank)
 * ============================================================
 */

// ----- Configure your tab names here -----
var STUDY_SHEET = 'StudyLog';
var MOCK_SHEET  = 'Mocks';

function doGet(e) {
  var out = { study: readSheet(STUDY_SHEET), mocks: readSheet(MOCK_SHEET) };
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Read a tab into an array of {header:value} objects. */
function readSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    var blank = true;
    for (var c = 0; c < headers.length; c++) {
      var v = values[r][c];
      if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      obj[headers[c]] = v;
      if (v !== '' && v != null) blank = false;
    }
    if (!blank) rows.push(obj);
  }
  return rows;
}
