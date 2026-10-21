# OKV School Website Package

This package is the public website and its backend. The school system itself (the installer) is a separate package.

## What is in the package

| Folder | What it is | Where it goes |
|---|---|---|
| 1_Apps_Script/Code.gs | The backend: forms, activation codes, the Google Sheet it creates for you | Google Apps Script (script.google.com) |
| 1_Apps_Script/appsscript.json | Apps Script settings (time zone, permissions) | Same Apps Script project |
| 2_Website/ | The whole website in one folder: index.html, activate.html, legal.html, demo.html, css/, js/, img/ (screenshots) | GitHub Pages (a public repository) |

## Pages and how they link

- index.html: home page. Screenshots of the system, download buttons, features, price, contact and installation forms. Links to every other page.
- demo.html: the live demo of the real system with sample data. Some fields are switched off in the demo, each with a link to get the full version. Linked from the home page and back.
- activate.html: payment receipt and activation request. Linked from the home page and the demo.
- legal.html: privacy, terms, cookies, refunds and licence agreement, with a link to each section.

## Three things you must do

1. Run setup() once in Apps Script. It creates the Google Sheet for you. (Guide: step 2.)
2. Deploy the Apps Script project as a web app and copy the address that ends in /exec. (Guide: step 4.)
3. Paste that address into 2_Website/js/config.js, set GITHUB_REPO, and upload the website folder to GitHub Pages. (Guide: steps 5 and 6.)

Everything else is described in SETUP_GUIDE.md, step by step.

## Important

- The Web app address is public by design: it is inside the website's code. Anyone who has it can send the public forms. The admin functions still need the dashboard password, and the data stays in your Google Sheet.
- Do not share the PRIVATE_KEY value (the licence signing key). Anyone with it can create activation codes.
- The demo sign-in (admin / demo1234) belongs to the sample school only. Change the admin password in the real system before you use it for a school.
