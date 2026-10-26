# Signals — Workshop Hub

A workshop website for sharing browser-tab presets and collecting student work. It lives in its own repository, completely separate from the tabletop projects.

## Cloudflare + Google Drive edition (current)

**Read [DRIVE_SETUP.md](./DRIVE_SETUP.md) for the one-time configuration.**

The app code is ready for a Cloudflare **Pages** project connected to this repo:

- GitHub repository: `LimboSoftware/signalsSoftware`
- Cloudflare project: `signals`
- Build output: `public` (repository root, build command `exit 0`)
- Backend: `functions/api/drive/[[path]].js`
- Storage: private [Signals Workshops Google Drive folder](https://drive.google.com/drive/folders/1y1ULkovpDkJbMb2Iuix3cKAgUjP7uS6V)

The host can save presets containing up to **20 URLs**, create named sessions and close submissions. Students visit the same short URL, choose a workshop, open the tabs, and upload their project work to that workshop's active session. Large files use resumable **8 MiB** Drive upload chunks (default 10 GiB maximum per file, configurable).

No D1 database is required for the Drive-based edition, but **Google OAuth, host password and Cloudflare Turnstile must be configured before live use**. A ChatGPT Google Drive connection alone does not authorise the website. Do not assume the upload workflow is functioning until both a small and large test file have been successfully received in Drive.

## Preserve the earlier GitHub Pages test

The previous GitHub Pages launcher remains in `docs/`, including the preset system published through GitHub Issues. It is not replaced by the new Drive edition.

- [GitHub Pages demo](https://limbosoftware.github.io/signalsSoftware/)
- Source for the older Cloudflare D1 prototype is retained for reference.

## Tests

Run `npm run check` and `npm test` (Node.js 22+), or see [Verify Signals app](./.github/workflows/verify.yml) in GitHub Actions.

**Do not store passwords, OAuth tokens, student work or resumable upload links in this repository.**
