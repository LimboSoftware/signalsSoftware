# Signals — Google Drive workshop hub

**Project:** `LimboSoftware/signalsSoftware` (independent of Tabletop Voice and ArmyTag).  
**Cloudflare deployment:** `signals`, connected to this GitHub repository.  
**Drive folder already created:** [Signals Workshops](https://drive.google.com/drive/u/0/my-drive).

## What is built

The Cloudflare Pages frontend is under `public/`; its backend is `functions/api/drive/[[path]].js`.

- Host saves, edits or deletes workshop presets containing 1–20 website links directly in Google Drive.
- Host starts a distinct submission **session** for any preset and receives a six-character session code.
- Students select the preset at a single shared web address, open its links and submit files to that preset's currently open session.
- Each student enters their name, the session code and completes Cloudflare Turnstile verification. A new private student folder is created inside the session's Drive folder.
- The drag-and-drop uploader streams files in **8 MiB resumable chunks** via the Cloudflare Function into Google's resumable Drive Upload API. This is designed for images, documents, videos, ZIPs and large creative projects without routing one multi-gigabyte request through Cloudflare.
- Students **cannot browse your Drive**; Google credentials and resumable session URLs are held server-side, while upload access uses encrypted, limited-lived tokens.
- Each preset/session is stored as Google Drive files and folders — no D1 database is needed in this version. Previous Cloudflare D1 experiments remain in source but are not used by the new UI.
- The original GitHub Pages test UI is retained in `docs/`; the Drive-powered UI is served from `public/` on Cloudflare Pages.

**Important:** The code is committed and syntax/API smoke tests are configured, but real Drive OAuth, Turnstile and a live large-file upload still require configuration and real-world verification. Do not invite students to submit real work until an end-to-end test succeeds.

## 1. Confirm your Cloudflare project is Pages

In Cloudflare → Workers & Pages → `signals`:

- Project **type:** Cloudflare **Pages** (not a standalone Worker).
- GitHub repository: `LimboSoftware/signalsSoftware`.
- Production branch: `main`.
- Root directory: repository root / blank.
- Build command: `exit 0`.
- Build output directory: `public`.

Deploy the latest commit. If `signals` is a Workers project instead, the `functions/` Pages Functions routes won't be loaded automatically; stop and switch the build/deployment configuration rather than creating a duplicate `signals` project.

## 2. Configure Google Drive OAuth (one-time)

**Connecting Google Drive in ChatGPT does not authorise this Cloudflare website.** You must explicitly authorise Signals itself.

In [Google Cloud Console](https://console.cloud.google.com/), create or select a project dedicated to Signals. Enable **Google Drive API**. Configure the OAuth consent screen for the Google account that owns the Drive folder.

1. Create a **Desktop application** OAuth client under **APIs & Services → Credentials**.
2. On your local computer, with Node.js 22+ installed, run:
   ```bash
   node scripts/authorize-drive.mjs
   ```
3. Paste the OAuth client ID and client secret into the local Terminal prompts (not into ChatGPT). Follow the Google authorisation link; sign in to **the same Google account** that owns the Signals Workshops folder and grant access.
4. The script prints the OAuth refresh token. Copy the ID, secret and refresh token **straight into Cloudflare encrypted secrets** and close the Terminal. Never commit them to GitHub.

Google may expire refresh tokens after **7 days** if an External OAuth consent screen remains in **Testing** mode. For longer-term use, Google may require that the OAuth app be moved to Production and potentially verified for the Drive scope. This implementation requests the full Drive scope in order to use the folder created by your existing connected Drive account. Prefer a separate workshop-only Google account if you don't want to grant that scope over your main Drive.

## 3. Configure Cloudflare Pages settings

In `signals` → **Settings → Variables and Secrets**, add the following to your **Production** environment. Mark secrets as **encrypted**:

| Variable | Value | Type |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth Desktop client ID | Secret |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | Secret |
| `GOOGLE_REFRESH_TOKEN` | Refresh token from local script | Secret |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | `PASTE_YOUR_SIGNALS_DRIVE_FOLDER_ID` | Text variable |
| `HOST_PASSWORD` | Unique password with 12+ characters | Secret |
| `UPLOAD_TOKEN_SECRET` | Random unique string with at least 32 characters; don't reuse your host password | Secret |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile widget site key for the Signals domain | Text variable |
| `TURNSTILE_SECRET` | Matching Turnstile secret key | Secret |
| `MAX_UPLOAD_BYTES` (optional) | Maximum size per file in bytes; defaults to `10737418240` (10 GiB) | Text variable |

You can generate a random upload token secret locally with `openssl rand -hex 32` on Mac Terminal, or any reputable password generator. Don't disclose these values in chat or GitHub.

After saving, **redeploy** the `signals` production deployment so the Function sees the new variables. You do not need a D1 or R2 binding for the Drive-backed implementation.

## 4. Configure Turnstile

In your Cloudflare account, create a **Turnstile** widget for the exact hostname where students will use Signals. Choose an appropriate managed widget mode and obtain its site key and secret. Configure both variables above. **Anonymous uploads stay disabled if Turnstile is missing**; this is intentional to reduce drive-by spam/abuse.

Make sure the widget is configured for the production hostname and any preview hostname you intend to test.

## 5. Verify safely before a real workshop

1. Open `https://<your-signals-domain>/api/drive/config`. It should report `driveConnected: true` and a Turnstile site key, but no OAuth credentials.
2. Open `https://<your-signals-domain>/api/drive/catalogue`. Initially it should return `{"presets":[]}` or your saved presets, not a 503 error.
3. Open Signals, choose **Host**, enter the host password, create a 2–3 URL preset and save it.
4. Start a session for that preset. Note its **six-character submission code**.
5. On another computer or a private browser window, choose the same preset. Verify that **Open all workshop tabs** works (Chrome may require pop-up permission).
6. Enter a **test student name**, the code, complete Turnstile and upload a small text file.
7. Verify a session folder and student folder appear in the private [Signals Workshops Drive folder](https://drive.google.com/drive/u/0/my-drive), with the file inside.
8. Then test a large ZIP/video (for example, 200 MB–1 GB) over a stable network and confirm the file fully arrives. An interrupted upload can be resumed by reselecting the same file in the same browser session.

**Limits and security:** Max 20 completed files per student folder, default 10 GiB per file (configurable), 8 MiB chunks. Uploads require the session code and a human check, but these are not the same as personal accounts. Do not use this for confidential student records. Google applies its own Drive storage and daily upload limits. Closing a session prevents new uploads but an already-issued upload token may allow a previously started upload to finish for up to 24 hours.

## Running tests locally

No dependencies need installing:

```bash
npm run check
npm test
```

Automated CI is at `.github/workflows/verify.yml`; mocks test authentication boundaries and preset persistence without contacting a real Google account.

## Project structure

- `public/index.html` and `public/style.css` — Cloudflare workshop website.
- `public/workshop.js` — preset manager, sessions and student resumable uploader.
- `functions/api/drive/[[path]].js` — server-side Drive API, OAuth refresh, sessions and uploads.
- `scripts/authorize-drive.mjs` — local Google authorisation helper.
- `tests/drive.test.mjs` — mocked API tests.
- `docs/` — existing GitHub Pages test, unchanged.
- `functions/api/presets.js` and `schema.sql` — old D1 experiment, unused by the new website.

No tabletop repositories are involved.
