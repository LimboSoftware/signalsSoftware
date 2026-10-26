# Workshop Tab Launcher

## Cloudflare project `signals`: live shared presets

This repo has two launch modes: **GitHub Pages static test** (existing GitHub Issue-based publishing) and **Cloudflare Pages with live D1** (direct, instant publishing without GitHub Issues).

The Cloudflare Pages implementation is already committed to GitHub:

- `functions/api/presets.js` — Pages Function API: list, save, update, and delete presets.
- `public/index.html` and `docs/index.html` — automatically switch to the Cloudflare API when viewed on a non-`github.io` hostname.
- `public/_routes.json` and `docs/_routes.json` — route only `/api/*` to the Pages Function.
- No database migration is required: the first API request creates the table if it doesn't exist.

### Complete the one-time Cloudflare Pages configuration

These settings must be completed in the **Cloudflare dashboard**, because the GitHub connector alone cannot configure your Cloudflare account.

1. In **Workers & Pages → signals**, verify **signals is a Pages project**, with Git integration pointing to `LimboSoftware/signalsSoftware` and the production branch set to `main`.
2. Under **Builds / Build configuration**, set **Root directory** to repository root (usually blank), **Build command** to `exit 0`, and **Build output directory** to `public` (the `docs` folder works too).
3. Under **Storage & databases → D1**, create a database, for example `signals-presets`.
4. Back in **Workers & Pages → signals → Settings → Bindings**, add **D1 database** and set the **Variable name** exactly to `DB`. Select the new database. Save.
5. In **Settings → Variables and Secrets**, add a **secret** (not a public variable) called `HOST_PASSWORD` with a strong unique password (at least 12 characters). The password must **not** go into GitHub or the repository.
6. Trigger **Redeploy** on the latest production deployment after both the D1 binding and secret are saved. These bindings are applied on deployment.
7. Open the `*.pages.dev` URL shown in the Cloudflare project. Press **I'm the host**, create your preset, and press **Save preset**. Enter the host password on first use. The student homepage automatically checks for updates every 10 seconds.

**Test the API:** `https://<your-project-domain>/api/presets` should return `{"presets":[]}` before you create the first preset. If it reports a missing `DB` binding, revisit step 4. If you see a 404, verify the Pages project, the build output folder, and the `/functions` folder at the repository root.

**Important:** If `signals` is a *Workers* project instead of a *Pages* project, the Pages Functions route won't deploy automatically. Confirm the project type before following these instructions. The legacy standalone Worker files in this repo were built for another deployment arrangement.

**Security:** Anybody may read/open the shared workshop list, but saving/deleting requires the private host password. Anyone who learns that password can modify presets. Only share workshop URLs that are appropriate for the group; they are publicly visible to students.

## GitHub Pages — shared workshop presets

**Open the live launcher:** https://limbosoftware.github.io/signalsSoftware/

The GitHub Pages version now supports **up to 20 tabs per workshop** and **shared preset buttons**. Students can visit the same short address and click **Open all tabs** beside the named workshop. No room codes, student GitHub login, long individual links or database are needed.

### Host: make or update a preset

1. Visit the launcher and click **I'm the host — set up a preset**.
2. Name your workshop, enter any number of tabs from 1–20, or import the front Chrome window's first 20 website tabs using the supplied optional macOS Terminal command.
3. Click **Publish preset to GitHub**. Your browser opens a prefilled GitHub Issue.
4. **While signed in as `LimboSoftware`, click Create** on that GitHub Issue. This confirms your changes.
5. GitHub Actions validates the URLs and saves the preset into `docs/presets/index.json` and `presets/index.json`. GitHub Pages republishes automatically. Return to the launcher and press **Refresh workshop presets** to see the new button.

Using exactly the same preset name again **replaces** the existing preset's links rather than adding a duplicate. You can also click **Edit as host** next to any existing preset to load it into the editor.

> GitHub Pages is static and cannot securely receive host writes on its own. Publishing via a prefilled GitHub Issue is the one extra approval click that allows the preset to be saved to GitHub without asking for API tokens or exposing passwords. Only Issues opened or edited by the repository owner are eligible to publish.

### Students

Open **https://limbosoftware.github.io/signalsSoftware/** on each Mac. Choose the matching workshop and click **Open all tabs**. Chrome may initially block extra pop-ups; allow pop-ups from this GitHub Pages origin once. Students may also choose **Download bookmarks** to save a Chrome-importable bookmark HTML file.

The entire list of presets is public. Never publish private login tokens, restricted URLs or personal information. Updating an existing preset can take a short while as the GitHub workflow and GitHub Pages rebuild.

### Source files for this test

- `docs/index.html` / `index.html` — the GitHub Pages user interface
- `docs/presets/index.json` / `presets/index.json` — mirrored published preset catalogue
- `.github/workflows/publish-preset.yml` — validates the owner-created GitHub Issue and writes the catalogue
- `src/worker.js`, `public/index.html`, `schema.sql` — optional Cloudflare Worker version for live syncing later

## Optional future upgrade: live rooms

The Cloudflare Worker version remains in the repository for later use, if we decide to make the student pages update automatically while the workshop is running. It isn't required for the current GitHub Pages version.

