# Setup guide: from zero to a working website

Time needed: about 45 minutes the first time. You need a Google account (the one that will own the data), a GitHub account, and the installer kit (for the licence signing key).

Keep the Apps Script Execution log open while you work. Logs are at the top of the Apps Script editor: View > Logs (or Executions).

---

## Step 1. Create the Apps Script project

1. Go to https://script.google.com and sign in with the Google account that will own the data.
2. Click **New project**. Rename it to "OKV Website API" (click "Untitled project" at the top).
3. In the file list on the left, click **Code.gs**. Select everything in it and delete it.
4. Open the file **1_Apps_Script/Code.gs** from this package, copy all of it, and paste it into the editor.
5. Click the **gear icon** (Project Settings) on the left. Tick **Show "appsscript.json" manifest file in editor**.
6. Back in the editor, click **appsscript.json** in the file list. Replace its content with the content of **1_Apps_Script/appsscript.json** from this package.
7. Click the save icon (or press Ctrl+S).

## Step 2. Create the data sheet by running one function

You do not need to create a sheet by hand. The setup function does it.

1. At the top of the editor, in the function drop-down, choose **setup**.
2. Click **Run**.
3. A window asks you to **Review permissions**. Choose your account, then **Allow**. If you see "Google hasn't verified this app", click **Advanced**, then **Go to OKV Website API (unsafe)**, then **Allow**. This is normal for a script you wrote yourself.
4. Wait until the bottom panel says "Execution completed".
5. Open **View > Logs**. You will see:
   - **Google Sheet:** a link. Open it: it is named "OKV Website Data" and has a tab for each kind of record (Customers, Messages, Activations, Codes and more).
   - **Dashboard password:** a 12-character password. Write it down now. It is shown only once. You will need it to sign in to the admin functions (step 9).
   - **Licence codes added: 1000.**
6. Running setup again is safe: it keeps the same sheet, the same password and the same codes.

## Step 3. Enter your bank and contact details

1. Click the gear icon (Project Settings), scroll to **Script Properties**, and click **Add script property**.
2. Add or change these (names are exact, in capitals):

| Property | Example value |
|---|---|
| PAYMENT_DETAILS | Account name: OKV Technology Consults (new line) Bank: Access Bank (new line) Account number: 0123456789 |
| PRICE | 120000 |
| SUPPORT_EMAIL | technologyokv@gmail.com |
| WHATSAPP | +2348104141138 |
| WEBSITE | www.okvtechnology.com |
| SITE_NAME | OKV Technology Consults |

3. Click **Save script properties**. The website reads these values when a page opens.

## Step 4. Add the licence signing key (needed before you sell)

This key is what makes activation codes valid. It is created once, by the installer kit, and never shared.

1. Use the installer kit to create your key (tools/make_keys.py, see its guide). It produces a file named private_key_one_line.txt.
2. Open that file and copy the whole line.
3. In Script Properties, add a property named **PRIVATE_KEY** and paste the line as its value. Save.
4. Run **setup** again (step 2). The log should now say "Signing key found."

Without this key, activation codes cannot be created.

## Step 5. Deploy the backend as a web app

1. Click **Deploy** (top right) > **New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Set:
   - Description: "Website API v1"
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**. If asked, click **Authorize access** and allow as in step 2.
5. Copy the **Web app URL**. It starts with `https://script.google.com/macros/s/` and ends with `/exec`. Keep it.

Test it: paste the URL into a new browser tab. You should see text like `{"ok":true,"service":"OKV School System website API",...}`. If you see a sign-in page or an error, check "Who has access" is **Anyone**, then deploy again (step 5).

**After every change to Code.gs:** Deploy > Manage deployments > pencil icon > Version: **New version** > Deploy. The URL stays the same.

## Step 6. Paste the URL into the website (the only place to edit)

1. Unzip this package. Open **2_Website/js/config.js** in a plain text editor (Notepad, TextEdit, or VS Code).
2. Replace `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` with the URL from step 5. Keep the quote marks.
3. Replace `YOUR-GITHUB-USERNAME/YOUR-REPO` with your repository name, for example `yourname/school-system`. This is where the installer downloads come from. The installer kit's guide explains how to publish the installer release on that repository.
4. Save the file. The file should look like this:

```js
window.OKV_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
  GITHUB_REPO: 'yourname/school-system'
};
```

No other file needs the URL. Every page reads it from this file.

## Step 7. Publish the website on GitHub Pages

1. Go to https://github.com, sign in, and click **New** (repository).
2. Name it (for example `school-system`). Choose **Public**. Click **Create repository**.
3. Click **uploading an existing file**. Drag the **contents** of the **2_Website** folder into the page (the files index.html, activate.html, legal.html, demo.html, and the css, js and img folders, plus the hidden .nojekyll file). Do not upload the 2_Website folder itself; the files must sit at the top level. After the upload, the repository should show the folders css, img and js next to index.html.
   - If the hidden .nojekyll file does not appear, create a new empty file named `.nojekyll` by hand, or skip it: the site still works.
4. Click **Commit changes**.
5. Click **Settings** > **Pages**. Under "Build and deployment", set **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)**. Click **Save**.
6. Wait one to two minutes, then refresh the Pages settings page. It shows your address: `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

## Step 8. Check the website

Open your GitHub Pages address and work through this list:

- [ ] index.html opens with no yellow "Setup needed" bar.
- [ ] The price on the home page shows the value from PRICE (step 3).
- [ ] Each menu link opens its page: Home, Live demo, Pricing, Get activation code, Contact, Legal.
- [ ] Contact form: fill it in and send. You receive a reference (for example MSG-0001) and an email. A new row appears on the Messages tab of the sheet.
- [ ] Installation request form: send one. A row appears on the Services tab.
- [ ] Get activation code page: the bank details show; send a test with a small picture as the receipt. A row appears on the Activations tab and the receipt is saved to your Google Drive (folder "OKV Receipts").
- [ ] Live demo: the sample school opens and shows results. Click the menu items; they open. The change-password fields and the Save password button are switched off, with a gold "Available in the full version" link beside them. "Get the full version" in the bottom bar opens the activation page.
- [ ] Legal page: each section opens from the footer links.
- [ ] Phone: the layout fits the screen without sideways scrolling.

## Step 9. Send activation codes

When a customer's receipt arrives (Activations tab, Status "Pending"):

1. Check the payment in your bank account.
2. In the Apps Script editor, choose the function **sendPendingActivationCodes** and click **Run**.
3. Open View > Logs. It says how many codes were sent. Each code is emailed to the address the customer typed. Each request gets one code, and a request that already got one is skipped.
4. The customer types the code in the software: Admin > License > Activate.

This package has no admin web page. The dashboard password is only needed by the admin functions in Code.gs. To choose a new one, delete the ADMIN_HASH and ADMIN_SALT script properties (Project Settings > Script Properties), then run setup() again. A new random password is written to the log.

## Troubleshooting

| What you see | What to do |
|---|---|
| Yellow "Setup needed" bar on every page | config.js still has the placeholder. Complete step 6. |
| "Could not reach the server" when sending a form | Check the URL ends in /exec and that Deploy > Who has access is **Anyone**. Test the URL in a browser (step 5). |
| Form says "not connected to the server yet" | The API_URL was not saved correctly in config.js. Check the quote marks. |
| Download buttons show "installer link is not set yet" | GITHUB_REPO in config.js is still the placeholder, or the repository is not public. |
| The browser shows an authorization error at the Apps Script URL | Deploy again with Who has access = Anyone; use the URL from the **latest** deployment. |
| Changes to Code.gs do not show up | Create a **New version** of the deployment (step 5). |
| Emails are not sent | Apps Script limits the number of emails per day for free accounts. Check View > Logs for "Service invoked too many times". |
| Activation code email says "Could not save to Drive" | The receipt could not be saved; the request is still recorded. Check Drive permissions for the script. |
| A page looks different from the one in this guide | Refresh the page (Ctrl+F5). Old copies stay in browser memory. |

## Facts about what was tested

- The backend was tested with a stand-in for Google Apps Script (not Google's own servers): setup, the sheets, every form, admin sign-in and the code-sending function all ran without errors.
- The website was tested in a desktop Chromium browser against a stand-in for the Apps Script address: every page loads with no outside requests, every internal link works, forms send the right data, and the demo's switched-off fields and calls to action work.
- Not tested here: a live Apps Script deployment, a live GitHub Pages site, email delivery, Google Drive receipt saving, phones, and browsers other than Chromium. Please run the checklist in step 8 once, and tell us about anything that fails.
