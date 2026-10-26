# Workshop Tab Launcher

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

