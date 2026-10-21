/**
 * OKV Technology Consults - School Result and Accounting Management System
 * Website, customer database, activation server and OKV admin dashboard.
 * Runs only on Google Apps Script + Google Sheets (HTML pages use Bootstrap).
 *
 * One-time setup: see SETUP_GUIDE.md, then run setup() once from the editor.
 */

var SHEETS = {
  Customers:   ['ID','Created','Name','School','Email','Phone','Location','Role','Pupils','Source','Status','InstallationID','LicensedOn','Notes','LastContacted'],
  Downloads:   ['Time','CustomerID','Name','School','Email','Phone','Location','Role','Pupils','HeardFrom'],
  Activations: ['ID','Time','CustomerID','School','Name','Email','Phone','Amount','PaidOn','Bank','Reference','InstallationID','ReceiptURL','Notes','Status','CodeSent','SentOn','HandledBy'],
  Messages:    ['ID','Time','CustomerID','Name','Email','Phone','School','Message','Type','InstallationID','Status'],
  Installs:    ['Time','InstallationID','School','Name','Email','Phone','Address','CustomerID'],
  Codes:       ['Code','Status','AssignedTo','AssignedName','SentOn','UsedOn','InstallationID','Licensee','Batch'],
  Alerts:      ['ID','Time','Type','Title','Detail','Ref','Read'],
  Outbox:      ['Time','Channel','To','Subject','Message','By','Result'],
  Payments:    ['Reference','Time','Email','Name','School','Phone','Amount','Gateway','Status','CodeSent','VerifiedOn','InstallationID'],
  Services:    ['ID','Time','CustomerID','Name','School','Email','Phone','Location','Type','PreferredDate','Details','Status']
};
var CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* ------------------------------------------------------------------ helpers */
function P_() { return PropertiesService.getScriptProperties(); }
function cfg_(k, d) { var v = P_().getProperty(k); return (v === null || v === undefined || v === '') ? d : v; }
function ss_() { var id = P_().getProperty('SHEET_ID'); return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet(); }
function tz_() { return Session.getScriptTimeZone() || 'Africa/Lagos'; }
function now_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function safe_(v, max) {
  v = String(v === null || v === undefined ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (/^[=+\-@]/.test(v)) v = "'" + v;          // stop spreadsheet formula injection
  return v.substring(0, max || 500);
}
function esc_(v) { return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function sh_(name) {
  var s = ss_().getSheetByName(name);
  if (!s) {
    s = ss_().insertSheet(name);
    s.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold');
    s.getRange(2, 1, s.getMaxRows() - 1, SHEETS[name].length).setNumberFormat('@');   // keep everything as text
    s.setFrozenRows(1);
  }
  return s;
}
function table_(name) {
  var s = sh_(name), last = s.getLastRow(), cols = SHEETS[name].length, out = [];
  if (last < 2) return out;
  var v = s.getRange(2, 1, last - 1, cols).getValues();
  for (var i = 0; i < v.length; i++) {
    var o = { _row: i + 2 };
    for (var j = 0; j < cols; j++) o[SHEETS[name][j]] = String(v[i][j] === null || v[i][j] === undefined ? '' : v[i][j]);
    out.push(o);
  }
  return out;
}
function append_(name, obj) {
  var row = SHEETS[name].map(function (h) { return obj[h] === undefined ? '' : obj[h]; });
  var s = sh_(name);
  s.appendRow(row);
}
function setCell_(name, row, col, val) { sh_(name).getRange(row, SHEETS[name].indexOf(col) + 1).setValue(val); }
function nextId_(prefix, name) {
  var n = Math.max(0, sh_(name).getLastRow() - 1) + 1;
  return prefix + '-' + ('0000' + n).slice(-4);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
var CTX_ = {};
/** Include a partial AND evaluate its <?= ?> scriptlets with the same variables as the page. */
function include_(name) {
  var t = HtmlService.createTemplateFromFile(name);
  for (var k in CTX_) t[k] = CTX_[k];
  return t.evaluate().getContent();
}
function sha_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function limit_(key, max, seconds) {            // simple per-key rate limit
  var c = CacheService.getScriptCache(), n = Number(c.get(key) || 0);
  if (n >= max) throw new Error('Too many attempts. Please wait a little and try again.');
  c.put(key, String(n + 1), seconds);
}
function pub_() {
  return { price: Number(cfg_('PRICE', '120000')), whatsapp: cfg_('WHATSAPP', '+2348104141138'), email: cfg_('SUPPORT_EMAIL', 'technologyokv@gmail.com'),
           payment: paymentDetails_(), trialDays: 12, site: cfg_('SITE_NAME', 'OKV Technology Consults'), web: cfg_('WEBSITE', 'www.okvtechnology.com'),
           paystack: cfg_('PAYSTACK_ENABLED', '0') === '1' && !!cfg_('PAYSTACK_SECRET', ''), installNote: cfg_('INSTALL_NOTE', 'Quoted on request, after we hear about your school.'),
           announcement: cfg_('ANNOUNCEMENT', ''), maintenance: cfg_('MAINTENANCE', '0') === '1',
           manual: cfg_('MANUAL_ENABLED', '1') !== '0', heroTitle: cfg_('HERO_TITLE', ''), heroText: cfg_('HERO_TEXT', ''), oldPrice: Number(cfg_('OLD_PRICE', '')) || 0, promo: cfg_('PROMO_TEXT', '') };
}
function downloadLink_(plat) {
  var id = plat === 'mac' ? cfg_('DOWNLOAD_MAC_ID', '') : plat === 'win' ? cfg_('DOWNLOAD_WIN_ID', '') : '';
  if (!id) id = cfg_('DOWNLOAD_FILE_ID', '');
  return id ? 'https://drive.google.com/uc?export=download&id=' + id : '';
}
function money_(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/* ------------------------------------------------------------------ routing */
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action) return json_(apiGet_(p));
    return json_({ ok: true, service: 'OKV School System website API', version: '2.0', time: now_() });
  } catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
}

/* JSON calls from the GitHub Pages site. The body is {"rpc":1,"fn":"name","args":[...]} sent as text/plain.
   Only the functions in RPC_ALLOW_ can be called from outside; each admin function checks its own token. */
var RPC_ALLOW_ = ['publicConfig', 'submitDownload', 'submitContact', 'submitActivation', 'submitInstallRequest',
  'paystackInit', 'paystackConfirm', 'adminLogin', 'adminChangePassword', 'adminOverview', 'adminTable', 'adminMarkAlerts',
  'adminSetMessageStatus', 'adminUpdateCustomer', 'adminDeleteCustomer', 'adminGenerateCodes', 'adminSendCode',
  'adminApproveAll', 'adminRejectActivation', 'adminResetCode', 'adminRecipients', 'adminSendMessage', 'adminLogContact',
  'adminGetSettings', 'adminSaveSettings', 'adminVerifyPayments', 'adminRecordManualPayment', 'adminTestPaystack',
  'adminTestIntegration', 'adminSendSms', 'adminResetToken'];
function rpc_(fn, args) {
  if (fn === 'publicConfig') return { ok: true, result: pub_() };
  if (RPC_ALLOW_.indexOf(fn) < 0) return { ok: false, error: 'That request is not allowed.' };
  var target = RPC_TABLE_[fn];
  if (typeof target !== 'function') return { ok: false, error: 'That request is not allowed.' };
  var list = Array.isArray(args) ? args : [];
  return { ok: true, result: target.apply(null, list) };
}
var RPC_TABLE_ = {
  submitDownload: submitDownload, submitContact: submitContact, submitActivation: submitActivation, submitInstallRequest: submitInstallRequest,
  paystackInit: paystackInit, paystackConfirm: paystackConfirm, adminLogin: adminLogin, adminChangePassword: adminChangePassword,
  adminOverview: adminOverview, adminTable: adminTable, adminMarkAlerts: adminMarkAlerts, adminSetMessageStatus: adminSetMessageStatus,
  adminUpdateCustomer: adminUpdateCustomer, adminDeleteCustomer: adminDeleteCustomer, adminGenerateCodes: adminGenerateCodes,
  adminSendCode: adminSendCode, adminApproveAll: adminApproveAll, adminRejectActivation: adminRejectActivation, adminResetCode: adminResetCode,
  adminRecipients: adminRecipients, adminSendMessage: adminSendMessage, adminLogContact: adminLogContact, adminGetSettings: adminGetSettings,
  adminSaveSettings: adminSaveSettings, adminVerifyPayments: adminVerifyPayments, adminRecordManualPayment: adminRecordManualPayment,
  adminTestPaystack: adminTestPaystack, adminTestIntegration: adminTestIntegration, adminSendSms: adminSendSms, adminResetToken: adminResetToken
};

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    if (p.rpc) return json_(rpc_(String(p.fn || ''), p.args));
    var a = p.action;
    if (a === 'activation_request') return json_(handleActivation_(p, 'Dashboard'));
    if (a === 'register_install') return json_(handleRegister_(p));
    if (a === 'contact') return json_(handleContact_(p, 'Dashboard'));
    return json_({ ok: false, error: 'Unknown request' });
  } catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
}

function apiGet_(p) {
  if (p.action === 'info') { var c = pub_(); return { ok: true, price: c.price, payment: c.payment }; }
  if (p.action === 'config') return { ok: true, result: pub_() };
  if (p.action === 'redeem') return redeem_(p.code, p.iid);
  return { ok: false, error: 'Unknown request' };
}

/* ------------------------------------------------------------------ licence tokens (RSA-SHA256) */
function privateKey_() { return cfg_('PRIVATE_KEY', '').replace(/\\n/g, '\n'); }
function signToken_(iid, code, licensee) {
  var payload = ['OKV1', iid, code, today_(), String(licensee || '').replace(/\|/g, ' ').substring(0, 80)].join('|');
  var key = privateKey_();
  if (!key) throw new Error('The signing key is not set on the server. Contact OKV Technology Consults.');
  var sig = Utilities.computeRsaSha256Signature(payload, key);
  return { p: payload, s: Utilities.base64Encode(sig) };
}
function redeem_(code, iid) {
  code = String(code || '').replace(/\s+/g, '').toUpperCase();
  iid = String(iid || '').trim().toUpperCase();
  if (!/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(iid)) return { ok: false, error: 'This installation has no valid ID. Contact OKV Technology Consults.' };
  limit_('redeem_' + iid, 10, 900);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var rows = table_('Codes'), hit = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].Code === code) { hit = rows[i]; break; }
    if (!hit) return { ok: false, error: 'That code is not valid. Check it and try again.' };
    if (hit.Status === 'Used' && hit.InstallationID !== iid) return { ok: false, error: 'That code has already been used on another installation. Contact OKV Technology Consults.' };
    var licensee = hit.Licensee || hit.AssignedName || '';
    if (hit.Status !== 'Used') {
      setCell_('Codes', hit._row, 'Status', 'Used'); setCell_('Codes', hit._row, 'UsedOn', now_()); setCell_('Codes', hit._row, 'InstallationID', iid);
      var cust = findCustomerByEmail_(hit.AssignedTo);
      if (cust) { setCell_('Customers', cust._row, 'Status', 'Active'); setCell_('Customers', cust._row, 'InstallationID', iid); setCell_('Customers', cust._row, 'LicensedOn', today_()); licensee = licensee || cust.School; setCell_('Codes', hit._row, 'Licensee', licensee); }
      addAlert_('Activated', 'System activated', (licensee || 'A school') + ' activated installation ' + iid + ' with code ' + code, code);
    }
    return { ok: true, token: signToken_(iid, code, licensee) };
  } finally { lock.releaseLock(); }
}

/* ------------------------------------------------------------------ customers, alerts, mail */
function findCustomerByEmail_(email) {
  email = String(email || '').toLowerCase();
  if (!email) return null;
  var rows = table_('Customers');
  for (var i = 0; i < rows.length; i++) if (rows[i].Email.toLowerCase() === email) return rows[i];
  return null;
}
function upsertCustomer_(f, source, status) {
  var c = findCustomerByEmail_(f.email);
  if (c) {
    var fill = { Name: f.name, School: f.school, Phone: f.phone, Location: f.location, Role: f.role, Pupils: f.pupils, InstallationID: f.iid };
    for (var k in fill) if (fill[k] && !c[k]) setCell_('Customers', c._row, k, safe_(fill[k], 200));
    if (status) setCell_('Customers', c._row, 'Status', status);
    return c.ID;
  }
  var id = nextId_('CUS', 'Customers');
  append_('Customers', { ID: id, Created: now_(), Name: safe_(f.name, 120), School: safe_(f.school, 160), Email: safe_(f.email, 160), Phone: safe_(f.phone, 40),
    Location: safe_(f.location, 120), Role: safe_(f.role, 80), Pupils: safe_(f.pupils, 40), Source: source, Status: status || 'Lead', InstallationID: safe_(f.iid, 40) });
  return id;
}
function addAlert_(type, title, detail, ref, attachments) {
  var id = nextId_('ALT', 'Alerts');
  append_('Alerts', { ID: id, Time: now_(), Type: type, Title: safe_(title, 200), Detail: safe_(detail, 900), Ref: safe_(ref, 60), Read: 'No' });
  try { notify_('[OKV] ' + title, detail); } catch (e0) {}
  var owner = cfg_('OWNER_EMAIL', '');
  if (owner) {
    var base = ScriptApp.getService().getUrl();
    mail_(owner, '[OKV alert] ' + title, '<p><b>' + esc_(title) + '</b></p><p>' + esc_(detail).replace(/\n/g, '<br>') + '</p><p><a href="' + base + '?page=admin">Open the OKV dashboard</a></p>', { attachments: attachments, channel: 'Alert' });
  }
}
function wrap_(inner) {
  var c = pub_();
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;border:1px solid #d5d9e2;border-radius:8px;overflow:hidden">' +
    '<div style="background:#16213e;color:#fff;padding:16px 20px;font-size:18px"><b>' + esc_(c.site) + '</b><div style="font-size:12px;color:#c9cfdd">School Result and Accounting Management System</div></div>' +
    '<div style="padding:20px;color:#1d2433;font-size:14px;line-height:1.55">' + inner + '</div>' +
    '<div style="background:#f3f4f8;color:#667085;padding:12px 20px;font-size:12px">' + esc_(c.web) + ' &middot; ' + esc_(c.email) + ' &middot; WhatsApp ' + esc_(c.whatsapp) + '</div></div>';
}
function mail_(to, subject, html, opts) {
  opts = opts || {};
  var result = 'Sent';
  try {
    var o = { to: to, subject: subject, htmlBody: opts.raw ? html : wrap_(html), name: cfg_('SITE_NAME', 'OKV Technology Consults'), replyTo: cfg_('SUPPORT_EMAIL', 'technologyokv@gmail.com') };
    if (opts.attachments && opts.attachments.length) o.attachments = opts.attachments;
    MailApp.sendEmail(o);
  } catch (err) { result = 'Failed: ' + String(err.message || err).substring(0, 120); }
  try { append_('Outbox', { Time: now_(), Channel: opts.channel || 'Email', To: safe_(to, 200), Subject: safe_(subject, 200), Message: safe_(String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), 300), By: opts.by || 'System', Result: result }); } catch (e2) {}
  return result === 'Sent';
}
function need_(f, list) {
  for (var k in list) if (!String(f[k] === undefined ? '' : f[k]).trim()) throw new Error('Please enter ' + (/^your /.test(list[k]) ? '' : 'the ') + list[k] + '.');
  if (f.email && !EMAIL_RE.test(String(f.email).trim())) throw new Error('Please enter a valid email address.');
}

/* ------------------------------------------------------------------ public forms (landing, pricing, dashboard) */
function submitDownload(f) {
  f = f || {};
  if (f.website) return { ok: true };            // honeypot
  checkOpen_('DOWNLOADS_ENABLED');
  need_(f, { name: 'your name', school: 'school name', email: 'email address', phone: 'phone number' });
  if (!f.consent) throw new Error('Please tick the box to agree that we may contact you about your download.');
  limit_('dl_' + String(f.email).toLowerCase(), 5, 3600);
  var id = upsertCustomer_(f, 'Landing page download', 'Trial');
  append_('Downloads', { Time: now_(), CustomerID: id, Name: safe_(f.name, 120), School: safe_(f.school, 160), Email: safe_(f.email, 160), Phone: safe_(f.phone, 40),
    Location: safe_(f.location, 120), Role: safe_(f.role, 80), Pupils: safe_(f.pupils, 40), HeardFrom: safe_(f.heard, 120) });
  var plat = f.platform === 'mac' ? 'mac' : 'win';
  var winL = downloadLink_('win'), macL = downloadLink_('mac'), link = plat === 'mac' ? macL : winL;
  addAlert_('Download', 'New download: ' + f.school, 'Platform: ' + (plat === 'mac' ? 'Mac' : 'Windows') + '\n' + f.name + ' <' + f.email + '>\nPhone: ' + f.phone + '\nLocation: ' + (f.location || '-') + '\nPupils: ' + (f.pupils || '-') + '\nRole: ' + (f.role || '-'), id);
  var c = pub_();
  mail_(String(f.email).trim(), 'Your free trial download - School Result and Accounting Management System',
    '<p>Hello ' + esc_(f.name) + ',</p><p>Thank you for choosing our system for <b>' + esc_(f.school) + '</b>. Your <b>' + c.trialDays + '-day free trial</b> download is ready.</p>' +
    ((winL || macL) ? '<p style="text-align:center;margin:22px 0">' + (winL ? '<a href="' + winL + '" style="background:#b58a2c;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold;margin:4px;display:inline-block">Download for Windows</a>' : '') + (macL ? '<a href="' + macL + '" style="background:#16213e;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold;margin:4px;display:inline-block">Download for Mac</a>' : '') + '</p>' : '<p>We will email you the download link shortly.</p>') +
    '<p><b>To install</b></p><ol><li>Extract the ZIP file.</li><li><b>Windows:</b> double-click <b>SchoolSystemSetup.exe</b> and follow the wizard. <b>Mac:</b> open the .dmg and drag the app into Applications. A simple instruction file is inside.</li><li>Sign in with the username and password given in the instructions, and change the password.</li><li>Download your role manuals (PDF) from the button at the top of each dashboard.</li></ol>' +
    '<p>After the trial the system is <b>&#8358;' + money_(c.price) + ' one time</b>, with no monthly fees. You can activate right from the admin dashboard.</p><p>Questions? Reply to this email or WhatsApp us on ' + esc_(c.whatsapp) + '.</p>', { channel: 'Auto' });
  return { ok: true, link: link, win: winL, mac: macL, platform: plat, ref: id, emailed: true };
}

function submitContact(f) {
  f = f || {};
  if (f.website) return { ok: true };
  need_(f, { name: 'your name', email: 'email address', message: 'message' });
  limit_('ct_' + String(f.email).toLowerCase(), 5, 3600);
  return handleContact_(f, 'Landing page');
}
function handleContact_(f, source) {
  need_(f, { name: 'your name', email: 'email address' });
  var cid = upsertCustomer_(f, source === 'Dashboard' ? 'Trial dashboard' : 'Landing page contact', null);
  var id = nextId_('MSG', 'Messages');
  append_('Messages', { ID: id, Time: now_(), CustomerID: cid, Name: safe_(f.name, 120), Email: safe_(f.email, 160), Phone: safe_(f.phone, 40), School: safe_(f.school, 160),
    Message: safe_(f.message, 1500), Type: 'Contact (' + source + ')', InstallationID: safe_(f.iid, 40), Status: 'New' });
  addAlert_('Message', 'New message from ' + f.name, (f.school ? f.school + '\n' : '') + f.email + (f.phone ? '\n' + f.phone : '') + '\n\n' + (f.message || ''), id);
  mail_(String(f.email).trim(), 'We received your message', '<p>Hello ' + esc_(f.name) + ',</p><p>Thank you for contacting OKV Technology Consults. We have received your message (reference <b>' + id + '</b>) and will reply soon.</p>', { channel: 'Auto' });
  return { ok: true, ref: id };
}
function handleRegister_(f) {
  need_(f, { name: 'your name', email: 'email address', school: 'school name' });
  var cid = upsertCustomer_(f, 'Trial dashboard', 'Trial');
  append_('Installs', { Time: now_(), InstallationID: safe_(f.iid, 40), School: safe_(f.school, 160), Name: safe_(f.name, 120), Email: safe_(f.email, 160), Phone: safe_(f.phone, 40), Address: safe_(f.address, 200), CustomerID: cid });
  addAlert_('Registration', 'Trial installation registered: ' + f.school, f.name + ' <' + f.email + '>\nInstallation ID: ' + f.iid, cid);
  return { ok: true, ref: cid };
}

function submitActivation(f) { f = f || {}; if (f.website) return { ok: true }; checkOpen_('ACTIVATION_ENABLED'); return handleActivation_(f, 'Website'); }
function handleActivation_(f, source) {
  need_(f, { school: 'school name', name: 'your name', email: 'email address', phone: 'phone number', amount: 'amount paid', paid_on: 'payment date', receipt_data: 'payment receipt' });
  limit_('act_' + String(f.email).toLowerCase(), 4, 3600);
  var m = /^data:([\w\/\-\.+]+);base64,(.+)$/.exec(String(f.receipt_data));
  if (!m || !/^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/.test(m[1])) throw new Error('The receipt must be a picture (JPG, PNG) or a PDF file.');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 4 * 1024 * 1024) throw new Error('The receipt file is larger than 4 MB.');
  var id = nextId_('REQ', 'Activations');
  var name = id + '_' + String(f.school).replace(/[^\w\-]+/g, '_').substring(0, 40) + '_' + String(f.receipt_name || 'receipt').replace(/[^\w\.\-]+/g, '_').substring(0, 40);
  var blob = Utilities.newBlob(bytes, m[1], name);
  var url = '';
  try { var file = receiptFolder_().createFile(blob); url = file.getUrl(); } catch (e) { url = 'Could not save to Drive'; }
  var cid = upsertCustomer_(f, source === 'Dashboard' ? 'Trial dashboard' : 'Website', 'Pending activation');
  append_('Activations', { ID: id, Time: now_(), CustomerID: cid, School: safe_(f.school, 160), Name: safe_(f.name, 120), Email: safe_(f.email, 160), Phone: safe_(f.phone, 40), Amount: safe_(f.amount, 20),
    PaidOn: safe_(f.paid_on, 20), Bank: safe_(f.bank, 120), Reference: safe_(f.reference, 80), InstallationID: safe_(f.iid, 40), ReceiptURL: url, Notes: safe_(f.notes, 400), Status: 'Pending' });
  addAlert_('Activation request', 'Activation request: ' + f.school, f.name + ' <' + f.email + '>\nPhone: ' + f.phone + '\nPaid: N' + f.amount + ' on ' + f.paid_on + '\nBank/Ref: ' + (f.bank || '-') + ' / ' + (f.reference || '-') + '\nInstallation ID: ' + (f.iid || '-') + '\nReceipt: ' + url, id, [blob]);
  var autoMsg = '';
  if (cfg_('AUTO_APPROVE', '0') === '1') { try { sendCodeCore_({ requestId: id }, 'Auto-approve', false); autoMsg = ' (code sent automatically)'; } catch (eAuto) { addAlert_('Activation request', 'Auto-approve failed for ' + f.school, String(eAuto.message), id); } }
  mail_(String(f.email).trim(), 'We received your payment receipt (' + id + ')',
    '<p>Hello ' + esc_(f.name) + ',</p><p>Thank you. We have received your activation request for <b>' + esc_(f.school) + '</b>.</p><p>Reference: <b>' + id + '</b><br>Amount: &#8358;' + esc_(f.amount) + '<br>Payment date: ' + esc_(f.paid_on) + '</p>' +
    '<p><b>Your activation code will be sent to this email address within 24 hours</b> (usually much sooner). When it arrives, open the admin dashboard of the system, go to <b>Admin &rarr; License</b>, type the code and press Activate.</p>', { channel: 'Auto' });
  return { ok: true, ref: id };
}
function receiptFolder_() {
  var id = cfg_('RECEIPT_FOLDER_ID', '');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder('OKV Payment Receipts');
  P_().setProperty('RECEIPT_FOLDER_ID', f.getId());
  return f;
}

/* ------------------------------------------------------------------ OKV admin dashboard API */
function auth_(token) {
  if (!token || !CacheService.getScriptCache().get('tok_' + token)) throw new Error('SESSION_EXPIRED');
  return true;
}
function adminLogin(password) {
  var c = CacheService.getScriptCache();
  var tries = Number(c.get('adminfail') || 0);
  if (tries >= 5) throw new Error('Too many wrong attempts. Try again in 15 minutes.');
  var salt = cfg_('ADMIN_SALT', ''), hash = cfg_('ADMIN_HASH', '');
  if (!hash || sha_(salt + String(password || '')) !== hash) { c.put('adminfail', String(tries + 1), 900); throw new Error('Wrong password.'); }
  c.remove('adminfail');
  var token = Utilities.getUuid() + Utilities.getUuid();
  c.put('tok_' + token, '1', 21600);
  return { token: token };
}
function adminChangePassword(token, oldPw, newPw) {
  auth_(token);
  if (sha_(cfg_('ADMIN_SALT', '') + String(oldPw || '')) !== cfg_('ADMIN_HASH', '')) throw new Error('Your current password is not correct.');
  if (String(newPw || '').length < 8) throw new Error('Use at least 8 characters.');
  var salt = Utilities.getUuid();
  P_().setProperties({ ADMIN_SALT: salt, ADMIN_HASH: sha_(salt + newPw) });
  return { ok: true };
}
function adminOverview(token) {
  auth_(token);
  var codes = table_('Codes'), cnt = { Available: 0, Sent: 0, Used: 0 };
  codes.forEach(function (c) { cnt[c.Status] = (cnt[c.Status] || 0) + 1; });
  var acts = table_('Activations'), alerts = table_('Alerts'), msgs = table_('Messages'), cust = table_('Customers');
  return { customers: cust.length, downloads: table_('Downloads').length, installs: table_('Installs').length,
    pending: acts.filter(function (a) { return a.Status === 'Pending'; }).length,
    active: cust.filter(function (c) { return c.Status === 'Active'; }).length,
    newMessages: msgs.filter(function (m) { return m.Status === 'New'; }).length,
    unread: alerts.filter(function (a) { return a.Read !== 'Yes'; }).length,
    codes: cnt, totalCodes: codes.length, quota: MailApp.getRemainingDailyQuota(),
    recentAlerts: alerts.slice(-8).reverse(), pendingList: acts.filter(function (a) { return a.Status === 'Pending'; }).slice(-5).reverse() };
}
function adminTable(token, name, opts) {
  auth_(token); opts = opts || {};
  if (!SHEETS[name]) throw new Error('Unknown list');
  var rows = table_(name);
  if (opts.status) rows = rows.filter(function (r) { return r.Status === opts.status; });
  if (opts.unread) rows = rows.filter(function (r) { return r.Read !== 'Yes'; });
  var q = String(opts.q || '').toLowerCase();
  if (q) rows = rows.filter(function (r) { return SHEETS[name].some(function (h) { return String(r[h]).toLowerCase().indexOf(q) >= 0; }); });
  if (name !== 'Codes') rows.reverse();
  var size = Math.min(200, Number(opts.size) || 50), page = Math.max(1, Number(opts.page) || 1);
  return { total: rows.length, rows: rows.slice((page - 1) * size, page * size), page: page, size: size };
}
function adminMarkAlerts(token, ids) {
  auth_(token);
  table_('Alerts').forEach(function (a) { if (ids === 'all' || (ids || []).indexOf(a.ID) >= 0) setCell_('Alerts', a._row, 'Read', 'Yes'); });
  return { ok: true };
}
function adminSetMessageStatus(token, id, status) {
  auth_(token);
  table_('Messages').forEach(function (m) { if (m.ID === id) setCell_('Messages', m._row, 'Status', status); });
  return { ok: true };
}
function adminUpdateCustomer(token, id, f) {
  auth_(token);
  var c = table_('Customers').filter(function (x) { return x.ID === id; })[0];
  if (!c) throw new Error('Customer not found.');
  ['Name', 'School', 'Phone', 'Location', 'Status', 'Notes', 'Email'].forEach(function (k) { if (f[k] !== undefined) setCell_('Customers', c._row, k, safe_(f[k], 300)); });
  return { ok: true };
}
function adminDeleteCustomer(token, id) {
  auth_(token);
  var c = table_('Customers').filter(function (x) { return x.ID === id; })[0];
  if (c) sh_('Customers').deleteRow(c._row);
  return { ok: true };
}
function generateCodes_(n, batch) {
  var existing = {}; table_('Codes').forEach(function (c) { existing[c.Code] = 1; });
  var rows = [], guard = 0;
  while (rows.length < n && guard++ < n * 20) {
    var parts = [];
    for (var p = 0; p < 3; p++) { var s = ''; for (var i = 0; i < 4; i++) s += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length)); parts.push(s); }
    var code = 'OKV-' + parts.join('-');
    if (existing[code]) continue;
    existing[code] = 1;
    rows.push([code, 'Available', '', '', '', '', '', '', batch]);
  }
  var s = sh_('Codes'), start = s.getLastRow() + 1;
  s.getRange(start, 1, rows.length, SHEETS.Codes.length).setNumberFormat('@').setValues(rows);
  return rows.length;
}
function adminGenerateCodes(token, n) {
  auth_(token); n = Math.max(1, Math.min(2000, Number(n) || 100));
  return { made: generateCodes_(n, 'B' + today_().replace(/-/g, '')) };
}
function nextAvailable_() {
  var rows = table_('Codes');
  for (var i = 0; i < rows.length; i++) if (rows[i].Status === 'Available') return rows[i];
  return null;
}
function codeEmail_(name, school, code) {
  var c = pub_();
  return '<p>Hello ' + esc_(name) + ',</p><p>Thank you for your payment. Here is the activation code for <b>' + esc_(school || 'your school') + '</b>:</p>' +
    '<p style="text-align:center;font-size:26px;letter-spacing:2px;font-weight:bold;background:#f3f4f8;border:1px dashed #b58a2c;padding:14px;border-radius:8px">' + esc_(code) + '</p>' +
    '<p><b>To activate</b></p><ol><li>Sign in to the system as the <b>administrator</b>.</li><li>Open <b>Admin &rarr; License</b>.</li><li>Type the code in <b>Activation code</b> and press <b>Activate</b>. The computer must be online for this one step.</li></ol>' +
    '<p>The code works for one installation. Keep this email safe. If you ever move to another computer, contact us and we will help.</p><p>Thank you for choosing us.</p>';
}
function adminSendCode(token, f) { auth_(token); return sendCodeCore_(f, 'OKV admin', false); }
function sendCodeCore_(f, by, locked) {
  f = f || {};
  var lock = null;
  if (!locked) { lock = LockService.getScriptLock(); lock.waitLock(20000); }
  try {
    var email = String(f.email || '').trim(), name = f.name || 'Customer', school = f.school || '', req = null;
    if (f.requestId) {
      req = table_('Activations').filter(function (a) { return a.ID === f.requestId; })[0];
      if (!req) throw new Error('Request not found.');
      if (req.CodeSent) throw new Error('A code was already sent for this request (' + req.CodeSent + ').');
      email = req.Email; name = req.Name; school = req.School;
    }
    if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email address.');
    var row = null;
    if (f.code) { row = table_('Codes').filter(function (c) { return c.Code === String(f.code).toUpperCase(); })[0]; if (!row || row.Status !== 'Available') throw new Error('That code is not available.'); }
    else row = nextAvailable_();
    if (!row) throw new Error('No activation codes are left. Generate more codes first.');
    var ok = mail_(email, 'Your activation code - School Result and Accounting Management System', codeEmail_(name, school, row.Code), { channel: 'Activation code', by: by });
    if (!ok) throw new Error('The email could not be sent (daily limit reached or address rejected). The code was NOT used. Try again later.');
    setCell_('Codes', row._row, 'Status', 'Sent'); setCell_('Codes', row._row, 'AssignedTo', email); setCell_('Codes', row._row, 'AssignedName', safe_(name, 120));
    setCell_('Codes', row._row, 'SentOn', now_()); setCell_('Codes', row._row, 'Licensee', safe_(school, 120));
    if (req) { setCell_('Activations', req._row, 'Status', 'Approved'); setCell_('Activations', req._row, 'CodeSent', row.Code); setCell_('Activations', req._row, 'SentOn', now_()); setCell_('Activations', req._row, 'HandledBy', by); }
    var cust = findCustomerByEmail_(email);
    if (cust) { setCell_('Customers', cust._row, 'Status', 'Code sent'); setCell_('Customers', cust._row, 'LastContacted', now_()); }
    else upsertCustomer_({ name: name, school: school, email: email, phone: f.phone || '' }, 'Dashboard', 'Code sent');
    return { ok: true, code: row.Code, to: email };
  } finally { if (lock) lock.releaseLock(); }
}
function adminApproveAll(token) {
  auth_(token);
  var sent = 0, failed = 0;
  table_('Activations').filter(function (a) { return a.Status === 'Pending'; }).forEach(function (a) {
    try { sendCodeCore_({ requestId: a.ID }, 'OKV admin', false); sent++; } catch (e) { failed++; }
  });
  return { sent: sent, failed: failed };
}
function adminRejectActivation(token, id, reason) {
  auth_(token);
  var req = table_('Activations').filter(function (a) { return a.ID === id; })[0];
  if (!req) throw new Error('Request not found.');
  setCell_('Activations', req._row, 'Status', 'Rejected'); setCell_('Activations', req._row, 'HandledBy', 'OKV admin');
  mail_(req.Email, 'About your activation request ' + id, '<p>Hello ' + esc_(req.Name) + ',</p><p>We could not confirm your payment for request <b>' + id + '</b>.</p><p>' + esc_(reason || 'Please check the receipt and send it again, or contact us.') + '</p><p>You can submit the request again from the License page of your dashboard, or reply to this email.</p>', { channel: 'Activation', by: 'OKV admin' });
  return { ok: true };
}
function adminResetCode(token, code) {
  auth_(token);
  var c = table_('Codes').filter(function (x) { return x.Code === String(code).toUpperCase(); })[0];
  if (!c) throw new Error('Code not found.');
  ['AssignedTo', 'AssignedName', 'SentOn', 'UsedOn', 'InstallationID', 'Licensee'].forEach(function (k) { setCell_('Codes', c._row, k, ''); });
  setCell_('Codes', c._row, 'Status', 'Available');
  return { ok: true };
}
function adminRecipients(token, status) {
  auth_(token);
  return table_('Customers').filter(function (c) { return !status || c.Status === status; })
    .map(function (c) { return { ID: c.ID, Name: c.Name, School: c.School, Email: c.Email, Phone: c.Phone, Status: c.Status }; });
}
function fill_(text, c) { return String(text).replace(/\{name\}/gi, c.Name || 'there').replace(/\{school\}/gi, c.School || 'your school'); }
function adminSendMessage(token, f) {
  auth_(token); f = f || {};
  var subject = String(f.subject || '').trim(), body = String(f.body || '').trim();
  if (!subject || !body) throw new Error('Enter the subject and the message.');
  var list = (f.recipients || []).slice(0, 400), sent = 0, failed = 0, left = MailApp.getRemainingDailyQuota();
  if (list.length > left) throw new Error('Your daily email limit allows ' + left + ' more emails today. Select fewer recipients.');
  list.forEach(function (r) {
    if (!EMAIL_RE.test(String(r.Email || ''))) { failed++; return; }
    var html = '<p>' + esc_(fill_(body, r)).replace(/\n/g, '<br>') + '</p>';
    if (mail_(r.Email, fill_(subject, r), html, { channel: 'Email', by: 'OKV admin' })) {
      sent++; var c = findCustomerByEmail_(r.Email); if (c) setCell_('Customers', c._row, 'LastContacted', now_());
    } else failed++;
  });
  return { sent: sent, failed: failed, remaining: MailApp.getRemainingDailyQuota() };
}
function adminLogContact(token, channel, to, subject) {
  auth_(token);
  append_('Outbox', { Time: now_(), Channel: channel, To: safe_(to, 200), Subject: safe_(subject, 200), Message: 'Opened from dashboard', By: 'OKV admin', Result: 'Opened' });
  return { ok: true };
}
var SETTING_KEYS = ['OWNER_EMAIL', 'SUPPORT_EMAIL', 'WHATSAPP', 'PRICE', 'PAYMENT_DETAILS', 'BANK_NAME', 'ACCOUNT_NAME', 'ACCOUNT_NUMBER', 'DOWNLOAD_FILE_ID', 'DOWNLOAD_WIN_ID', 'DOWNLOAD_MAC_ID', 'SITE_NAME', 'WEBSITE',
  'PAYSTACK_PUBLIC', 'PAYSTACK_ENABLED', 'PAYSTACK_AUTO_CODE', 'TELEGRAM_CHAT', 'TERMII_SENDER', 'INSTALL_NOTE', 'ANNOUNCEMENT', 'MAINTENANCE', 'DOWNLOADS_ENABLED', 'ACTIVATION_ENABLED',
  'MANUAL_ENABLED', 'AUTO_APPROVE', 'HERO_TITLE', 'HERO_TEXT', 'OLD_PRICE', 'PROMO_TEXT'];
var SECRET_KEYS = ['PAYSTACK_SECRET', 'TELEGRAM_TOKEN', 'TERMII_KEY', 'WEBHOOK_URL'];
function adminGetSettings(token) {
  auth_(token);
  var o = {}; SETTING_KEYS.forEach(function (k) { o[k] = cfg_(k, ''); });
  o.secrets = {}; SECRET_KEYS.forEach(function (k) { o.secrets[k] = !!cfg_(k, ''); });
  if (o.PAYSTACK_AUTO_CODE === '') o.PAYSTACK_AUTO_CODE = '1';
  if (o.DOWNLOADS_ENABLED === '') o.DOWNLOADS_ENABLED = '1';
  if (o.ACTIVATION_ENABLED === '') o.ACTIVATION_ENABLED = '1';
  if (o.MANUAL_ENABLED === '') o.MANUAL_ENABLED = '1';
  if (o.AUTO_APPROVE === '') o.AUTO_APPROVE = '0';
  o.keySet = !!privateKey_(); o.downloadLink = downloadLink_(); o.winLink = downloadLink_('win'); o.macLink = downloadLink_('mac'); o.url = ScriptApp.getService().getUrl();
  return o;
}
function adminSaveSettings(token, f) {
  auth_(token); f = f || {};
  var p = {};
  SETTING_KEYS.forEach(function (k) { if (f[k] !== undefined) p[k] = String(f[k]).trim(); });
  SECRET_KEYS.forEach(function (k) { if (f[k] !== undefined && String(f[k]).trim() !== '') p[k] = String(f[k]).trim(); });
  if (p.PRICE && isNaN(Number(p.PRICE))) throw new Error('The price must be a number.');
  if (p.PAYSTACK_ENABLED === '1' && !(p.PAYSTACK_SECRET || cfg_('PAYSTACK_SECRET', ''))) throw new Error('Add your Paystack secret key before switching Paystack on.');
  P_().setProperties(p);
  (f.clear || []).forEach(function (k) { if (SECRET_KEYS.indexOf(k) >= 0) P_().deleteProperty(k); });
  return { ok: true };
}


/* ================================================================== v2 additions ================================================================== */
/* ---- structured payment info, site switches ---- */
function paymentDetails_() {
  var n = cfg_('BANK_NAME', ''), a = cfg_('ACCOUNT_NAME', ''), no = cfg_('ACCOUNT_NUMBER', '');
  if (n && no) return 'Account name: ' + (a || cfg_('SITE_NAME', 'OKV Technology Consults')) + '\nBank: ' + n + '\nAccount number: ' + no;
  return cfg_('PAYMENT_DETAILS', 'Account details are shown after you request activation.');
}
function checkOpen_(flag) {
  if (cfg_('MAINTENANCE', '0') === '1') throw new Error('The website is being updated. Please try again in a few minutes.');
  if (flag && cfg_(flag, '1') === '0') throw new Error('This form is switched off at the moment. Please contact us on WhatsApp ' + cfg_('WHATSAPP', '+2348104141138') + '.');
}
function intl_(p) { var d = String(p || '').replace(/[^0-9]/g, ''); if (d.indexOf('234') === 0) return d; if (d.charAt(0) === '0') return '234' + d.slice(1); return d; }

/* ---- installation service requests ---- */
function submitInstallRequest(f) {
  f = f || {};
  if (f.website) return { ok: true };
  checkOpen_();
  need_(f, { name: 'your name', school: 'school name', email: 'email address', phone: 'phone number', location: 'town and state' });
  limit_('sv_' + String(f.email).toLowerCase(), 4, 3600);
  var cid = upsertCustomer_(f, 'Installation request', 'Lead');
  var id = nextId_('SRV', 'Services');
  append_('Services', { ID: id, Time: now_(), CustomerID: cid, Name: safe_(f.name, 120), School: safe_(f.school, 160), Email: safe_(f.email, 160), Phone: safe_(f.phone, 40), Location: safe_(f.location, 120),
    Type: safe_(f.type || 'On site', 40), PreferredDate: safe_(f.date, 30), Details: safe_(f.details, 800), Status: 'New' });
  addAlert_('Installation', 'Installation request: ' + f.school, f.name + ' <' + f.email + '>\n' + f.phone + '\n' + f.location + '\n' + (f.type || 'On site') + (f.date ? ' on ' + f.date : '') + '\n' + (f.details || ''), id);
  mail_(String(f.email).trim(), 'We received your installation request (' + id + ')', '<p>Hello ' + esc_(f.name) + ',</p><p>Thank you. OKV Technology Consults has received your request to install the School Result and Accounting Management System for <b>' + esc_(f.school) + '</b>.</p><p>Reference: <b>' + id + '</b></p><p>We will contact you shortly with a quote and a date.</p>', { channel: 'Auto' });
  return { ok: true, ref: id };
}

/* ---- Paystack ---- */
function paystackFetch_(path, method, body) {
  var key = cfg_('PAYSTACK_SECRET', '');
  if (!key) throw new Error('Paystack is not set up yet.');
  var o = { method: method || 'get', headers: { Authorization: 'Bearer ' + key }, muteHttpExceptions: true };
  if (body) { o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  var res = UrlFetchApp.fetch('https://api.paystack.co' + path, o), j;
  try { j = JSON.parse(res.getContentText()); } catch (e) { throw new Error('Paystack sent an unreadable reply.'); }
  return j;
}
function paystackReady_() { return cfg_('PAYSTACK_ENABLED', '0') === '1' && !!cfg_('PAYSTACK_SECRET', ''); }
function paystackInit(f) {
  f = f || {};
  if (f.website) return { ok: true };
  checkOpen_('ACTIVATION_ENABLED');
  need_(f, { name: 'your name', school: 'school name', email: 'email address', phone: 'phone number' });
  if (!paystackReady_()) throw new Error('Online payment is not available right now. Please pay by bank transfer and submit your receipt.');
  limit_('ps_' + String(f.email).toLowerCase(), 6, 3600);
  var price = Number(cfg_('PRICE', '120000')), ref = 'OKV' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 9000 + 1000);
  var j = paystackFetch_('/transaction/initialize', 'post', { email: String(f.email).trim(), amount: Math.round(price * 100), currency: 'NGN', reference: ref,
    callback_url: ScriptApp.getService().getUrl() + '?page=paid', metadata: { school: f.school, name: f.name, phone: f.phone, iid: f.iid || '' } });
  if (!j.status || !j.data) throw new Error('Paystack: ' + (j.message || 'could not start the payment'));
  upsertCustomer_(f, 'Paystack checkout', 'Lead');
  append_('Payments', { Reference: ref, Time: now_(), Email: safe_(f.email, 160), Name: safe_(f.name, 120), School: safe_(f.school, 160), Phone: safe_(f.phone, 40), Amount: price, Gateway: 'Paystack', Status: 'Initialized', InstallationID: safe_(f.iid, 40) });
  return { ok: true, url: j.data.authorization_url, reference: ref };
}
function payRow_(ref) { return table_('Payments').filter(function (p) { return p.Reference === ref; })[0] || null; }
function paystackConfirm(reference) {
  reference = String(reference || '').replace(/[^A-Za-z0-9_\-]/g, '');
  if (!payRow_(reference)) throw new Error('We could not find that payment reference.');
  return settlePayment_(reference);
}
function settlePayment_(ref) {
  var lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    var row = payRow_(ref);
    if (!row) throw new Error('Payment not found.');
    if (row.Status === 'Paid') return { paid: true, emailed: !!row.CodeSent, auto: !!row.CodeSent, email: row.Email };
    var j = paystackFetch_('/transaction/verify/' + encodeURIComponent(ref), 'get'), d = j.data;
    if (!j.status || !d) throw new Error('Paystack could not confirm this payment yet. Try again in a minute.');
    if (d.status !== 'success') { if (d.status === 'failed' || d.status === 'abandoned') setCell_('Payments', row._row, 'Status', d.status === 'failed' ? 'Failed' : 'Abandoned'); return { paid: false, status: d.status }; }
    var price = Number(cfg_('PRICE', '120000')) * 100;
    if (Number(d.amount) < price || String(d.currency) !== 'NGN') { setCell_('Payments', row._row, 'Status', 'Underpaid'); addAlert_('Payment', 'Paystack payment needs checking: ' + row.School, 'Reference ' + ref + ' paid ' + (d.amount / 100) + ' ' + d.currency + ', expected ' + (price / 100) + ' NGN.', ref); return { paid: false, status: 'underpaid' }; }
    setCell_('Payments', row._row, 'Status', 'Paid'); setCell_('Payments', row._row, 'VerifiedOn', now_());
    var f = { name: row.Name, school: row.School, email: row.Email, phone: row.Phone, iid: row.InstallationID };
    upsertCustomer_(f, 'Paystack', 'Pending activation');
    addAlert_('Payment', 'Paystack payment received: ' + row.School, row.Name + ' <' + row.Email + '>\nN' + money_(price / 100) + ' ref ' + ref, ref);
    var auto = cfg_('PAYSTACK_AUTO_CODE', '1') === '1', sentCode = '';
    if (auto) {
      try { sentCode = sendCodeCore_({ email: row.Email, name: row.Name, school: row.School }, 'Paystack', true).code; setCell_('Payments', row._row, 'CodeSent', sentCode); }
      catch (e) { addAlert_('Payment', 'Code could not be sent automatically: ' + row.School, String(e.message), ref); auto = false; }
    }
    if (!sentCode) {
      var id = nextId_('REQ', 'Activations');
      append_('Activations', { ID: id, Time: now_(), CustomerID: '', School: row.School, Name: row.Name, Email: row.Email, Phone: row.Phone, Amount: row.Amount, PaidOn: today_(), Bank: 'Paystack', Reference: ref, InstallationID: row.InstallationID, ReceiptURL: 'Paystack (verified)', Status: 'Pending' });
      mail_(row.Email, 'Payment received - ' + ref, '<p>Hello ' + esc_(row.Name) + ',</p><p>We received your payment of &#8358;' + money_(row.Amount) + ' for <b>' + esc_(row.School) + '</b>. <b>Your activation code will be emailed within 24 hours.</b></p>', { channel: 'Auto' });
    }
    return { paid: true, auto: !!sentCode, email: row.Email };
  } finally { lock.releaseLock(); }
}
function adminVerifyPayments(token) {
  auth_(token);
  var n = 0, paid = 0;
  table_('Payments').filter(function (p) { return p.Gateway === 'Paystack' && (p.Status === 'Initialized' || p.Status === 'Underpaid'); }).slice(-30).forEach(function (p) {
    try { n++; if (settlePayment_(p.Reference).paid) paid++; } catch (e) {}
  });
  return { checked: n, paid: paid };
}
function adminRecordManualPayment(token, f) {
  auth_(token); f = f || {};
  need_(f, { school: 'school name', name: 'name', email: 'email address', amount: 'amount' });
  var ref = 'MAN-' + Date.now().toString(36).toUpperCase();
  append_('Payments', { Reference: ref, Time: now_(), Email: safe_(f.email, 160), Name: safe_(f.name, 120), School: safe_(f.school, 160), Phone: safe_(f.phone, 40), Amount: Number(f.amount) || 0, Gateway: 'Manual (' + safe_(f.method || 'Transfer', 30) + ')', Status: 'Paid', VerifiedOn: now_(), InstallationID: safe_(f.iid, 40) });
  upsertCustomer_(f, 'Manual payment', 'Pending activation');
  return { ok: true, ref: ref };
}
function adminTestPaystack(token) {
  auth_(token);
  var j = paystackFetch_('/bank?perPage=1', 'get');
  if (!j.status) throw new Error('Paystack rejected the key: ' + (j.message || 'unknown error'));
  return { ok: true, mode: String(cfg_('PAYSTACK_SECRET', '')).indexOf('sk_live') === 0 ? 'LIVE keys' : 'TEST keys' };
}

/* ---- outgoing alerts and SMS ---- */
function notify_(title, detail) {
  var tg = cfg_('TELEGRAM_TOKEN', ''), chat = cfg_('TELEGRAM_CHAT', ''), wh = cfg_('WEBHOOK_URL', '');
  if (tg && chat) { try { UrlFetchApp.fetch('https://api.telegram.org/bot' + tg + '/sendMessage', { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify({ chat_id: chat, text: title + '\n' + detail }) }); } catch (e) {} }
  if (wh) { try { UrlFetchApp.fetch(wh, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify({ title: title, detail: detail, time: now_(), source: 'okv-site' }) }); } catch (e) {} }
}
function adminTestIntegration(token, which) {
  auth_(token);
  if (which === 'telegram') {
    var tg = cfg_('TELEGRAM_TOKEN', ''), chat = cfg_('TELEGRAM_CHAT', '');
    if (!tg || !chat) throw new Error('Enter the Telegram bot token and chat ID first.');
    var r = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + tg + '/sendMessage', { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify({ chat_id: chat, text: 'OKV dashboard test message' }) }).getContentText());
    if (!r.ok) throw new Error('Telegram said: ' + (r.description || 'error'));
    return { ok: true };
  }
  if (which === 'webhook') {
    if (!cfg_('WEBHOOK_URL', '')) throw new Error('Enter the webhook URL first.');
    var res = UrlFetchApp.fetch(cfg_('WEBHOOK_URL'), { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify({ title: 'Test', detail: 'OKV dashboard test', time: now_() }) });
    return { ok: res.getResponseCode() < 400, code: res.getResponseCode() };
  }
  if (which === 'sms') {
    if (!cfg_('TERMII_KEY', '')) throw new Error('Enter the Termii API key first.');
    return { ok: true, note: 'Key saved. Send a real SMS from Send messages to test delivery.' };
  }
  throw new Error('Unknown integration.');
}
function adminSendSms(token, f) {
  auth_(token); f = f || {};
  var key = cfg_('TERMII_KEY', ''), sender = cfg_('TERMII_SENDER', 'OKV'), body = String(f.body || '').trim();
  if (!key) throw new Error('Add your Termii API key under Integrations first.');
  if (!body) throw new Error('Enter the SMS text.');
  var sent = 0, failed = 0;
  (f.recipients || []).slice(0, 200).forEach(function (r) {
    var to = intl_(r.Phone);
    if (!to) { failed++; return; }
    try {
      var res = JSON.parse(UrlFetchApp.fetch('https://api.ng.termii.com/api/sms/send', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ to: to, from: sender, sms: fill_(body, r), type: 'plain', channel: 'generic', api_key: key }) }).getContentText());
      if (res.message_id || /success/i.test(String(res.message || ''))) sent++; else failed++;
    } catch (e) { failed++; }
    append_('Outbox', { Time: now_(), Channel: 'SMS', To: to, Subject: '', Message: safe_(fill_(body, r), 300), By: 'OKV admin', Result: 'Requested' });
  });
  return { sent: sent, failed: failed };
}

/* ---- support tools: password reset codes for schools ---- */
function adminResetToken(token, iid, email) {
  auth_(token);
  iid = String(iid || '').trim().toUpperCase();
  if (!/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(iid)) throw new Error('The installation ID must look like XXXX-XXXX-XXXX-XXXX.');
  var exp = Utilities.formatDate(new Date(Date.now() + 36 * 3600 * 1000), tz_(), 'yyyy-MM-dd'), nonce = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  var payload = ['OKV1R', iid, exp, nonce].join('|');
  if (!privateKey_()) throw new Error('The signing key is not set on the server.');
  var sig = Utilities.base64Encode(Utilities.computeRsaSha256Signature(payload, privateKey_()));
  var code = 'OKVR-' + Utilities.base64EncodeWebSafe(JSON.stringify({ p: payload, s: sig }));
  append_('Outbox', { Time: now_(), Channel: 'Reset code', To: safe_(email || iid, 200), Subject: 'Administrator password reset code', Message: 'Valid until ' + exp + ' for ' + iid, By: 'OKV admin', Result: 'Generated' });
  if (email) {
    if (!EMAIL_RE.test(String(email))) throw new Error('Enter a valid email address.');
    mail_(String(email).trim(), 'Your administrator password reset code', '<p>Hello,</p><p>Use this code on the sign-in page of the system: <b>Forgot password &rarr; Reset code</b>. It works once, only on the installation <b>' + esc_(iid) + '</b>, until <b>' + exp + '</b>.</p><p style="word-break:break-all;font-family:monospace;background:#f3f4f8;padding:10px;border-radius:6px">' + esc_(code) + '</p><p>If you did not ask for this, ignore this email.</p>', { channel: 'Reset code', by: 'OKV admin' });
  }
  return { code: code, expires: exp, emailed: !!email };
}

/* ---- charts data for the OKV dashboard ---- */
function adminCharts(token) {
  auth_(token);
  var days = {}, i, d;
  for (i = 29; i >= 0; i--) { d = Utilities.formatDate(new Date(Date.now() - i * 86400000), tz_(), 'yyyy-MM-dd'); days[d] = 0; }
  table_('Downloads').forEach(function (r) { var k = String(r.Time).slice(0, 10); if (days[k] !== undefined) days[k]++; });
  var by = function (list, key) { var o = {}; list.forEach(function (r) { var k = r[key] || 'Unknown'; o[k] = (o[k] || 0) + 1; }); return o; };
  var cust = table_('Customers'), pays = table_('Payments').filter(function (p) { return p.Status === 'Paid'; }), months = {};
  pays.forEach(function (p) { var m = String(p.VerifiedOn || p.Time).slice(0, 7); months[m] = (months[m] || 0) + (Number(p.Amount) || 0); });
  var codes = {}; table_('Codes').forEach(function (c) { codes[c.Status] = (codes[c.Status] || 0) + 1; });
  return { downloadsByDay: Object.keys(days).map(function (k) { return { d: k, n: days[k] }; }), customersByStatus: by(cust, 'Status'), sources: by(cust, 'Source'), codes: codes,
    revenueByMonth: Object.keys(months).sort().map(function (k) { return { m: k, v: months[k] }; }), revenue: pays.reduce(function (a, p) { return a + (Number(p.Amount) || 0); }, 0),
    alertsByType: by(table_('Alerts'), 'Type'), activations: by(table_('Activations'), 'Status'), services: by(table_('Services'), 'Status'), payments: by(table_('Payments'), 'Status') };
}
function adminSetServiceStatus(token, id, status) {
  auth_(token);
  table_('Services').forEach(function (m) { if (m.ID === id) setCell_('Services', m._row, 'Status', status); });
  return { ok: true };
}

/* ---- legal pages (templates for the owner to review with a lawyer) ---- */
var LEGAL_ = {
  privacy: ['Privacy Policy', [
    ['Who we are', 'OKV Technology Consults ("OKV", "we") sells and supports the School Result and Accounting Management System and operates this website.'],
    ['What we collect', 'On this website we collect the details you type into our forms: name, school, email address, phone number, town and state, role, number of pupils, how you heard about us, payment receipt images and payment references, installation requests and messages. If you pay online, Paystack collects your card or bank details; we receive only the payment status, reference and amount.'],
    ['Why we collect it', 'To give you the download, answer your questions, confirm payment, issue your activation code, provide installation and support, send updates you asked for, prevent fraud and keep business and tax records.'],
    ['Where it is kept', 'Submissions are stored in Google Sheets and Google Drive and sent by Gmail under our Google Workspace account. Alerts may also be forwarded to our own Telegram or other tools. Google and Paystack process data under their own policies.'],
    ['The school system', 'The software itself runs on your school computer. We do not receive your pupil, staff or accounting data. Data reaches us only when your administrator submits a form from the License page.'],
    ['Sharing', 'We do not sell your data. We share it only with service providers that help us run the business (Google, Paystack, SMS or messaging providers) and when the law requires.'],
    ['Retention', 'We keep customer and payment records for as long as needed for support, accounting and legal reasons, then delete or anonymise them.'],
    ['Your rights', 'Under the Nigeria Data Protection Act 2023 you may ask to access, correct or delete your personal data and may object to marketing. Write to technologyokv@gmail.com.'],
    ['Children', 'This website is for school owners and staff, not for children.'],
    ['Changes and contact', 'We may update this policy and will change the date below. Contact technologyokv@gmail.com or WhatsApp +234 810 414 1138.']]],
  terms: ['Terms of Use and Sale', [
    ['Using the website', 'You agree to give correct information in our forms and not to misuse the site, attack it or submit false receipts.'],
    ['Free trial', 'The trial lasts 12 days from first use of the installed system and includes all features. We may change or stop the trial offer at any time.'],
    ['Price and payment', 'The school licence is a one-time fee shown on the Pricing page, payable by bank transfer or Paystack. Prices may change; the price at the time you pay applies.'],
    ['Activation', 'After we confirm payment we email an activation code to the address you gave, within 24 hours. One code activates one installation. Do not share codes.'],
    ['Installation services', 'Installation, setup and training are optional services quoted separately. A quote is agreed before work starts.'],
    ['Software licence', 'Use of the software is governed by the Software Licence Agreement.'],
    ['Liability', 'To the extent the law allows we are not liable for indirect loss. Our liability is limited to the amount you paid us.'],
    ['Governing law', 'These terms are governed by the laws of the Federal Republic of Nigeria.']]],
  cookies: ['Cookie Policy', [
    ['Our website', 'We do not run advertising or analytics trackers on this website. The page is delivered by Google Apps Script, and Google may set technical cookies needed to serve it and protect against abuse.'],
    ['Your choice', 'We store one preference on your device, whether you dismissed the cookie notice. You can clear it in your browser settings.'],
    ['Paystack', 'If you pay online you leave our site for Paystack\'s page, which has its own cookie policy.'],
    ['The school software', 'The installed system sets one strictly necessary sign-in cookie on your school network. See the Cookie Policy inside the system.']]],
  refund: ['Refund Policy', [
    ['Try before you buy', 'Because you can use every feature free for 12 days, activation is final once a working activation code has been delivered.'],
    ['When we refund', 'We refund in full if (a) you paid and we did not deliver an activation code within 72 hours of confirming your payment, or (b) the system cannot run on your computer after our support team has tried to fix it, or (c) you paid twice by mistake.'],
    ['How to ask', 'Email technologyokv@gmail.com with your payment reference and installation ID. Approved refunds are paid to the original account within 7 working days. Paystack fees, if any, are not refundable by Paystack.'],
    ['Installation services', 'Services not yet carried out can be cancelled for a refund. Services already delivered are not refundable.']]],
  eula: ['Software Licence Agreement', [
    ['Grant', 'OKV grants your school a non-exclusive, non-transferable licence to install and use the System on its own computers for its own administration. After activation the licence has no time limit.'],
    ['One licence, one school', 'One activation covers one school installation. You may not resell the System, give your code to another school, or use it for a service bureau.'],
    ['Restrictions', 'You may not copy the System for distribution, remove or bypass licence checks, or reverse engineer it except where the law allows.'],
    ['Ownership', 'OKV keeps all rights in the software, manuals and branding. Your school owns its data.'],
    ['Support', 'Help is by email and WhatsApp. Installation and training are quoted separately.'],
    ['Warranty', 'The System is provided as is. We do not warrant that it is error-free or fits every school\'s needs. Check all results, invoices and receipts before issuing them.'],
    ['Termination', 'The licence ends if you break this agreement. Your data stays in your database file.']]]
};
function legalHtml_(slug) {
  var d = LEGAL_[slug]; if (!d) return null;
  return { title: d[0], body: d[1].map(function (s) { return '<h2>' + esc_(s[0]) + '</h2><p>' + esc_(s[1]) + '</p>'; }).join('') };
}

/* ------------------------------------------------------------------ one-time setup (run from the editor) */
/* RUN THIS ONCE: Run > setup. It creates the Google Sheet for the website data (or reuses it),
   creates every sheet with its headers, sets the default settings, creates 1,000 licence codes and
   sets a random dashboard password. The sheet link and the password are written to the Execution log. */
/* RUN FROM THE EDITOR whenever you want to email activation codes to customers who sent a payment receipt.
   Each pending request gets one code, emailed to the address the customer typed. Results go to the Execution log. */
function sendPendingActivationCodes() {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('tok_' + token, '1', 600);
  var r = adminApproveAll(token);
  Logger.log('Activation codes sent: ' + r.sent + '. Failed: ' + r.failed + '. Failures are listed on the Alerts sheet.');
  return r;
}

function setup() {
  var props = P_();
  var id = props.getProperty('SHEET_ID');
  var book = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('OKV Website Data');
  id = book.getId();
  props.setProperty('SHEET_ID', id);
  Object.keys(SHEETS).forEach(function (n) { sh_(n); });
  var blank = book.getSheetByName('Sheet1');
  if (blank && book.getSheets().length > 1 && blank.getLastRow() === 0) book.deleteSheet(blank);
  var def = { PRICE: '120000', SITE_NAME: 'OKV Technology Consults', WEBSITE: 'www.okvtechnology.com', SUPPORT_EMAIL: 'technologyokv@gmail.com', WHATSAPP: '+2348104141138',
              PAYMENT_DETAILS: 'Account name: OKV Technology Consults\nBank: (enter your bank)\nAccount number: (enter your account number)',
              ACTIVATION_ENABLED: '1', AUTO_APPROVE: '0', MAINTENANCE: '0' };
  Object.keys(def).forEach(function (k) { if (!props.getProperty(k)) props.setProperty(k, def[k]); });
  if (!props.getProperty('OWNER_EMAIL')) props.setProperty('OWNER_EMAIL', Session.getEffectiveUser().getEmail());
  var newPassword = '';
  if (!props.getProperty('ADMIN_HASH')) {
    var alphabet = CODE_ALPHABET; newPassword = '';
    for (var k = 0; k < 12; k++) newPassword += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    var salt = Utilities.getUuid();
    props.setProperties({ ADMIN_SALT: salt, ADMIN_HASH: sha_(salt + newPassword) });
  }
  var made = 0;
  if (table_('Codes').length < 1000) made = generateCodes_(1000 - table_('Codes').length, 'INITIAL');
  var key = privateKey_() ? 'Signing key found.' : 'NEXT: add the PRIVATE_KEY script property (see the setup guide, step 4).';
  Logger.log('SETUP COMPLETE');
  Logger.log('Google Sheet: https://docs.google.com/spreadsheets/d/' + id);
  if (newPassword) Logger.log('Dashboard password (write it down now, then change it): ' + newPassword);
  Logger.log('Licence codes added: ' + made + '. ' + key);
  return { ok: true, sheet: 'https://docs.google.com/spreadsheets/d/' + id, codesAdded: made, passwordCreated: !!newPassword };
}
