/* Shared behaviour for every page: connection check, server calls, forms, downloads, live prices. */
(function () {
  var CFG = window.OKV_CONFIG || {};
  var API = String(CFG.API_URL || '');
  var REPO = String(CFG.GITHUB_REPO || '');

  function apiReady() { return /^https:\/\/script\.google\.com\/macros\/s\/[^\/]+\/exec$/.test(API); }
  function repoReady() { return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(REPO) && REPO.indexOf('YOUR-') !== 0; }

  // Calls Code.gs. Resolves with the result, rejects with a readable message.
  function api(fn, args) {
    if (!apiReady()) return Promise.reject(new Error('The website is not connected to the server yet. Open js/config.js and paste the Apps Script web app address.'));
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ rpc: 1, fn: fn, args: args || [] }) })
      .then(function (r) { if (!r.ok) throw new Error('The server did not answer (' + r.status + '). Try again shortly.'); return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || 'The request could not be completed. Please try again.');
        return j.result;
      }, function () { throw new Error('Could not reach the server. Check your internet connection and try again.'); });
  }
  window.OKV = { api: api, apiReady: apiReady };

  function money(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function showNotice(text) {
    var box = document.getElementById('site-notice');
    if (!box) return;
    box.textContent = text;
    box.classList.toggle('show', !!text);
  }

  // Downloads point at the GitHub Release. Without a repository the buttons explain what to do.
  function wireDownloads() {
    var files = { 'dl-win': 'SchoolSystemSetup.exe', 'dl-mac-arm': 'SchoolSystem-arm64.dmg', 'dl-mac-intel': 'SchoolSystem-x86_64.dmg' };
    Object.keys(files).forEach(function (id) {
      var a = document.getElementById(id);
      if (!a) return;
      if (repoReady()) a.href = 'https://github.com/' + REPO + '/releases/latest/download/' + files[id];
      else a.addEventListener('click', function (e) { e.preventDefault(); showNotice('The installer link is not set yet. Open js/config.js and set GITHUB_REPO.'); });
    });
  }

  // Live values from Code.gs (price, WhatsApp, email, bank details). The page still shows its text if the server is not reached.
  function loadPublicConfig() {
    if (!apiReady()) return;
    api('publicConfig').then(function (c) {
      document.querySelectorAll('[data-cfg]').forEach(function (el) {
        var k = el.getAttribute('data-cfg');
        if (c[k] === undefined || c[k] === null || c[k] === '') return;
        el.textContent = k === 'price' ? money(c[k]) : String(c[k]);
      });
      document.querySelectorAll('[data-cfg-href]').forEach(function (el) {
        var k = el.getAttribute('data-cfg-href');
        if (k === 'whatsapp' && c.whatsapp) el.setAttribute('href', 'https://wa.me/' + String(c.whatsapp).replace(/[^0-9]/g, ''));
        if (k === 'email' && c.email) el.setAttribute('href', 'mailto:' + c.email);
      });
    }, function () { /* keep the built-in text; the notice below explains the problem when a form is used */ });
  }

  function formData(form) {
    var o = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === 'file' || el.type === 'submit' || el.type === 'button') return;
      o[el.name] = String(el.value || '').trim();
    });
    return o;
  }

  function readFile(input) {
    return new Promise(function (resolve, reject) {
      var f = input && input.files && input.files[0];
      if (!f) return resolve({ data: '', name: '' });
      if (f.size > 4 * 1024 * 1024) return reject(new Error('The receipt file is larger than 4 MB. Upload a smaller picture or PDF.'));
      var r = new FileReader();
      r.onload = function () { resolve({ data: String(r.result), name: f.name }); };
      r.onerror = function () { reject(new Error('The receipt could not be read. Try another file.')); };
      r.readAsDataURL(f);
    });
  }

  var FORM_CALLS = { contact: 'submitContact', install: 'submitInstallRequest', activate: 'submitActivation' };

  function wireForms() {
    document.querySelectorAll('form[data-form]').forEach(function (form) {
      var kind = form.getAttribute('data-form');
      var msg = form.querySelector('.msg');
      var btn = form.querySelector('button[type=submit]');
      var done = form.parentNode.querySelector('.done');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (msg) { msg.className = 'msg'; msg.textContent = ''; }
        if (!apiReady()) { if (msg) { msg.className = 'msg err'; msg.textContent = 'This form is not connected to the server yet. The site owner must paste the web app address in js/config.js.'; } return; }
        var data = formData(form);
        var fileInput = form.querySelector('input[type=file]');
        var prepared = fileInput ? readFile(fileInput).then(function (f) { data.receipt_data = f.data; data.receipt_name = f.name; }) : Promise.resolve();
        if (btn) { btn.disabled = true; btn.setAttribute('data-label', btn.textContent); btn.textContent = 'Sending...'; }
        prepared.then(function () { return api(FORM_CALLS[kind], [data]); })
          .then(function (res) {
            form.reset();
            if (done) { done.style.display = 'block'; if (res && res.ref) done.querySelector('.ref').textContent = res.ref; form.style.display = 'none'; }
            else if (msg) { msg.className = 'msg ok'; msg.textContent = 'Thank you. Your message has been received' + (res && res.ref ? ' (reference ' + res.ref + ').' : '.'); }
          })
          .catch(function (err) { if (msg) { msg.className = 'msg err'; msg.textContent = err.message; } })
          .then(function () { if (btn) { btn.disabled = false; btn.textContent = btn.getAttribute('data-label') || 'Send'; } });
      });
    });
  }

  function markActiveLink() {
    var here = (location.pathname.split('/').pop() || 'index.html');
    document.querySelectorAll('nav.menu a[href]').forEach(function (a) {
      if (a.getAttribute('href') === here) a.classList.add('active');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    markActiveLink();
    wireDownloads();
    wireForms();
    loadPublicConfig();
    if (!apiReady()) showNotice('Setup needed: this website is not connected to the server yet. Open js/config.js and paste the Apps Script web app address (see SETUP_GUIDE.md). The pages still open; the forms will tell you when they cannot be sent.');
    else if (!repoReady()) showNotice('Setup needed: set GITHUB_REPO in js/config.js so the download buttons work.');
  });
})();
