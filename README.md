# Storage Box Finder

A searchable home inventory with box numbers, locations, photos and labels you can actually read.

Built for the small household detail that is easy to forget. This is a standalone browser application with no account, telemetry, remote database or runtime dependencies.

## Start in three minutes

1. Download the release ZIP, extract it and open `index.html` in a current browser.
2. Add your first box, or choose **Load example** to see the fields before saving.
3. Choose **Save**, then **Export backup**. Keep that JSON file outside this browser.
4. Search your entries, edit details, and use **Print selected entries** for a paper copy. Your browser's print dialog can save a PDF.

The release build is self-contained and opens offline. If your browser blocks file-origin storage, serve the extracted folder locally with `python -m http.server 8000` and open `http://localhost:8000/`. Each origin has a separate library; moving from a file to a local server does not migrate data. Export then import a backup to move it.

## What you can keep

- Box number (required)
- Box name (required)
- Location (required)
- Contents, one item per line (required)
- Notes
- Optional reference photo, stored in the entry and included in backups

Search matches all authored text, including notes. Selected entries in the current search results print as readable two-column reference labels. Long notes can span more space; inspect the print preview. This is not a calibrated template for pre-cut label stock.

Box numbers must be unique. Use a location that will still make sense when you need to find it.

## Saving, backup and recovery

Changes save only when you choose **Save**. A success message confirms browser storage accepted the write. JSON backups include every saved entry and its photo. Unsaved form changes are not included. Import shows the incoming and current counts, then requires an explicit replacement checkbox. It replaces the whole library; export the current data first. Invalid files leave current data unchanged.

If saved bytes are unreadable, normal saves and normal export stop. **Download original bytes** preserves what could be read. A reviewed valid backup can replace those bytes only after confirmation. A change from another tab blocks stale writes; reload to see its current data. Deleting an entry requires confirmation and offers one-step undo until another saved change.

Browser storage is local to this browser, device and origin. It is not a durable backup or synchronization service. Browser clearing, profile loss, private browsing, quota limits and device failure can remove it. Storage is not encrypted by this application. Export often and protect backups and printouts.

## Limits and privacy

- Maximum 150 entries and 12 MB per library or imported backup. Browser quotas may be lower, especially with photos.
- Short fields allow 300 characters; long text allows 5,000. Images are limited to PNG, JPEG and WebP under 8 MB when selected, then prepared locally as a JPEG no larger than 250 KB. Resizing removes original file metadata and may reduce detail.
- No images, data, analytics or fonts are fetched. Clicking a link you entered or the source/support link opens that site under its own privacy policy.
- Import accepts only this tool's versioned JSON shape, unique IDs and valid field types. Photos must be embedded supported raster data. SVG and remote image URLs are rejected.
- No account, cloud sync, shared editing, automatic reminders or recognition features. A browser print/PDF export is the supported document output.
- Intended for current desktop and mobile browsers on Windows, macOS, Linux, Android and iOS. Actual verified browser coverage is recorded in `TESTING.md`; intended compatibility is not a claim of device testing.

## Develop

The offline ZIP also includes a complete rebuildable checkout under `source/`,
with its original module-based HTML, package lockfile, tests, build scripts,
examples and repository workflows. To develop from the ZIP, change into
`source/`, then run `npm ci` before the commands below. The root `index.html`
is the self-contained application for ordinary use.

Embedded photos are limited to 250 KB and 25 million pixels. Their encoded
dimensions are checked before browser decoding; imports and startup also verify
that each photo actually decodes. An unreadable saved photo blocks normal
saving and preserves the original storage bytes for recovery.

Requires Node.js 22 or newer. Install the pinned development dependencies with `npm ci`. The released app has no runtime dependencies.

```sh
npm test
npm run check
npm run build
```

Serve source with `python -m http.server 8000`. Build outputs are `dist/index.html`, a portable ZIP with readable source and documentation, and `dist/SHA256SUMS`. The build has no network requests.

## Status and contributions

Version 1.0.0 implements the bounded scope above. Gold acceptance and release verification are separate gates; a passing build does not assign Gold. Fixes and useful improvements are welcome through GitHub issues and pull requests. See `CONTRIBUTING.md`, `SECURITY.md`, `DEVELOPMENT.md` and `TESTING.md`. Maintenance is voluntary, with no response-time promise.

MIT License. Copyright 2026 Logan Pendragon Multiverse.

## Development checks

Use Node.js 22 or newer and Python 3. Install development-only dependencies with `npm ci`, then run `npm test`, `npm run check` and `npm run build`. For browser acceptance, install the pinned test browsers with `npx playwright install chromium firefox webkit`, then run `npm run test:browser`. CI repeats source checks on Linux, Windows and macOS, and browser acceptance uses Chromium, Firefox and WebKit. These checks do not establish testing on physical phones or every supported OS/browser combination.

`npm run format` applies the repository formatter. The formatter and browser harness are development tools; the distributed application runs without them, accounts or an Internet connection.
