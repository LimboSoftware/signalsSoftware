# Workshop Tab Launcher

## Open the workshop launcher

**[Launch the workshop website](https://limbosoftware.github.io/signalsSoftware/)** — this is the actual app, not the GitHub repository page. Enter three URLs, generate a student link, then open the link on each MacBook.

A host chooses up to three workshop URLs; students on other MacBooks join a shared room with a six-character code. The **Open all workshop tabs** button opens the same websites. Student pages poll for updates every seven seconds.

This repository is independent of Tabletop Voice, ArmyTag and other tabletop projects.

## Quick test using GitHub Pages (no Cloudflare needed)

This repository now includes a standalone, static test version in **`docs/index.html`**.

**Enable it once:**

1. Open [Repository Settings > Pages](https://github.com/LimboSoftware/signalsSoftware/settings/pages).
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select **`main`** and **`/docs`**, then click **Save**.
4. Open **https://limbosoftware.github.io/signalsSoftware/** once GitHub finishes publishing.

On the host Mac, enter your three website URLs, click **Create student link** and **Copy student link**, then share that URL with all MacBooks. Each student opens the shared link and clicks **Open all workshop tabs**. Chrome may ask to allow multiple pop-ups.

The host can optionally copy a Mac Terminal command from the page to import Chrome's first three website tabs. You can always paste URLs manually.

**Important limitation:** GitHub Pages is static. The selected URLs are embedded in the student link; to change them you must generate and share a new link. There are no live room codes or automatic remote updates in this test version. The Cloudflare implementation below remains available for that later.

## Deployment status

**The static GitHub Pages test is in `docs/`.** The full live-sync version requires separate deployment. GitHub Pages alone cannot run the room-sync API or database. A GitHub Actions workflow is included to deploy everything to **Cloudflare Workers + D1**, after a one-time Cloudflare setup.

## Deploy using GitHub (no Terminal required)

1. In your [Cloudflare dashboard](https://dash.cloudflare.com/) go to Storage & databases > D1 SQL databases and create a database called `workshop-tab-launcher-db`. Copy its UUID.
2. Create a Cloudflare API token with permissions **Workers Scripts: Edit** and **D1: Edit**, scoped to your Cloudflare account. Copy your Cloudflare **Account ID** too.
3. In this repository visit **Settings > Secrets and variables > Actions**. Add the **repository secrets** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Under **repository variables**, add `D1_DATABASE_ID` containing the database UUID.
4. Open **Actions > Deploy workshop launcher to Cloudflare > Run workflow**. The workflow initializes the database table and publishes the application.
5. Find the deployed address in the workflow log. It will resemble `https://workshop-tab-launcher.<your-subdomain>.workers.dev`.

The workflow skips automatic deploys until the D1 database ID variable is configured; subsequent pushes to the main branch redeploy.

**Do not add tokens, passwords, or private host URLs to repository files or issues.**

## Workshop use

On the host Mac, open the live site, press **Create workshop**, enter up to three URLs and press **Save & send to students**. Bookmark the private host link. Share the **student link** or six-character code. Students visit the site and click **Open all workshop tabs**. Allow pop-ups for the launcher site in Chrome if extra tabs are blocked.

The page checks for changed links roughly every seven seconds. Students must click the launch button again to open changed pages; the app does not remotely control their browsers.

To capture the first three Chrome tabs from the host Mac, use **Copy Mac tab capture command**, paste that command into macOS Terminal and approve Chrome automation access if prompted. The URLs fill into your host form; click Save. Manual pasting is always supported.

## Manual deployment alternative

Run `npx wrangler login`, then `npx wrangler d1 create workshop-tab-launcher-db`. Copy the printed database UUID into `wrangler.jsonc`, replacing `PASTE_DATABASE_ID_HERE`. Run:

```bash
npx wrangler d1 execute workshop-tab-launcher-db --remote --file=./schema.sql
npx wrangler deploy
```

## Files

- `public/index.html` — host and student interface.
- `src/worker.js` — API for rooms, updates, and host-only edits.
- `schema.sql` — D1 room table.
- `wrangler.jsonc` — Worker configuration (placeholder database ID for local deployment).
- `.github/workflows/deploy.yml` — Cloudflare deployment from GitHub.

Do not share host URLs containing `#host=` with students. Avoid publishing private links. Students must sign in themselves when the target websites require accounts.
