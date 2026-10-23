# Testing Storage Box Finder

Node.js 22+ runs the dependency-free automated suite:

```sh
npm test
npm run check
npm run build
```

The tests cover exact backup round trips, schema/type/size rejection, duplicate identity validation, literal user text, search, stale storage refusal, storage failure preservation, calendar validation and raster payload rejection. Project-specific constraints are tested where applicable.

## Browser acceptance still required

Use the source over local HTTP and the extracted release ZIP over file protocol. Test a current Chromium, Firefox and WebKit browser with desktop and narrow viewports. Follow the acceptance list in `DEVELOPMENT.md`; include actual downloads, reimport, corrupted storage, denied/quota storage, cross-tab writes, image preparation, keyboard controls, long text and print/PDF inspection. A syntax or unit-test pass alone is not browser acceptance or Gold evidence.

## Execution record

On 2026-10-23, Node.js 24.14.1 on Windows passed the focused unit suite, JavaScript syntax checks and the offline ZIP build. The current unit suite includes nine cases, including photo metadata bounds. A prior source/package browser pass used Playwright 1.64.1 with Chromium, Firefox and WebKit at 1280 × 900 and 390 × 844 viewports. It covered saved-entry workflows, actual backup downloads, deletion/undo, reviewed imports, asynchronous file races, photo preparation, corrupt storage recovery, quota and stale-tab refusal, narrow layout, print output and exact-ZIP offline entry points. The subsequent photo-import/startup decoding regression requires the coordinating final browser pass before release acceptance.

The browser script accepts `PLAYWRIGHT_MODULE` as a module URL for an existing pinned installation, or resolves `@playwright/test` normally. Set `PLAYWRIGHT_BROWSERS_PATH` if browser binaries are installed outside the default cache. Build first; the script extracts that exact ZIP using Python 3 and saves evidence under ignored `verification/`.

```sh
node browser-acceptance.mjs
```

The new photo regressions reject a header-valid but undecodable imported PNG before replacement preview and preserve original startup bytes when a saved photo cannot decode. Core tests reject absent/zero/oversized PNG, JPEG and WebP dimensions before browser allocation.

Physical label stock alignment and real iOS/Android devices are not verified. Browser print settings and local file storage policies vary. Independent review and remote release checks remain separate gates.
