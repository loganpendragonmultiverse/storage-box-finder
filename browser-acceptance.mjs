import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import http from "node:http";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const root = path.dirname(fileURLToPath(import.meta.url));
const { chromium, firefox, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE || "@playwright/test"
);
const config = JSON.parse(
  await fs.readFile(path.join(root, "product.json"), "utf8"),
);
const example = JSON.parse(
  await fs.readFile(path.join(root, "examples/example-backup.json"), "utf8"),
);
const output = path.join(root, "verification");
await fs.mkdir(output, { recursive: true });
const pkg = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
execFileSync(process.platform === "win32" ? "python" : "python3", [
  "-c",
  "import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])",
  path.join(root, "dist", `${pkg.name}-${pkg.version}.zip`),
  path.join(output, "extracted"),
]);
const server = http.createServer(async (req, res) => {
  try {
    const relative =
      decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(
        /^\//,
        "",
      ) || "index.html";
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) throw Error("outside");
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    res.end(await fs.readFile(file));
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const results = [];
try {
  for (const [browserName, browserType] of Object.entries({
    chromium,
    firefox,
    webkit,
  })) {
    const browser = await browserType.launch();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    const photoBuffer = Buffer.from(
      await page.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 2;
        c.height = 2;
        c.getContext("2d").fillRect(0, 0, 2, 2);
        return c.toDataURL("image/png").split(",")[1];
      }),
      "base64",
    );
    await page.locator("#example").click();
    await page.locator("#save").click();
    await page.locator(".card").waitFor();
    assert.equal(await page.locator(".card").count(), 1);
    await page.reload();
    assert.equal(await page.locator(".card").count(), 1);
    await page.locator(".card button").first().click();
    await page
      .locator("#notes")
      .fill(
        "Long reference note <script>literal only</script>\n" +
          "A useful detail. ".repeat(45),
      );
    await page.locator("#save").click();
    assert.match(await page.locator(".card").innerText(), /literal only/);
    assert.equal(
      await page
        .locator('script:not([src]):not([type="application/json"])')
        .count(),
      0,
    );
    await page.locator(".card button").first().click();
    await page.locator("#notes").fill("Draft for deletion");
    page.once("dialog", (d) => d.accept());
    await page.locator(".danger").click();
    assert.equal(await page.locator("#notes").inputValue(), "");
    await page.locator("#undo").click();
    assert.equal(await page.locator(".card").count(), 1);
    await page.locator("#search").fill("no match");
    assert.equal(await page.locator(".card").count(), 0);
    await page.locator("#search").fill(config.example.name);
    assert.equal(await page.locator(".card").count(), 1);
    await page.locator("#search").fill("");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#export").click(),
    ]);
    const backup = JSON.parse(await fs.readFile(await download.path(), "utf8"));
    assert.equal(backup.records.length, 1);
    assert.match(backup.records[0].notes, /literal only/);
    page.once("dialog", (d) => d.dismiss());
    await page.locator(".danger").click();
    assert.equal(await page.locator(".card").count(), 1);
    page.once("dialog", (d) => d.accept());
    await page.locator(".danger").click();
    assert.equal(await page.locator(".card").count(), 0);
    await page.locator("#undo").click();
    assert.equal(await page.locator(".card").count(), 1);
    await page.locator("#import").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{broken"),
    });
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("not valid JSON"),
    );
    assert.equal(await page.locator(".card").count(), 1);
    const originalPhotoBytes = await page.evaluate(
      (key) => localStorage.getItem(key),
      config.slug + ":v1",
    );
    const brokenPhotoBackup = structuredClone(example);
    brokenPhotoBackup.records[0].photo =
      "data:image/png;base64," + photoBuffer.subarray(0, 33).toString("base64");
    await page.locator("#import").setInputFiles({
      name: "broken-photo.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(brokenPhotoBackup)),
    });
    await page.waitForFunction(() =>
      document
        .querySelector("#status")
        .textContent.includes("cannot be decoded"),
    );
    assert.equal(await page.locator("#import-preview").isHidden(), true);
    assert.equal(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        config.slug + ":v1",
      ),
      originalPhotoBytes,
    );
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
      key: config.slug + ":v1",
      raw: JSON.stringify(brokenPhotoBackup),
    });
    await page.reload();
    assert.equal(await page.locator("#save").isDisabled(), true);
    assert.equal(await page.locator("#recovery").isVisible(), true);
    assert.equal(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        config.slug + ":v1",
      ),
      JSON.stringify(brokenPhotoBackup),
    );
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
      key: config.slug + ":v1",
      raw: originalPhotoBytes,
    });
    await page.reload();
    await page.locator("#import").setInputFiles({
      name: "good.json",

      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(example)),
    });
    await page.locator("#import-preview").waitFor({ state: "visible" });
    assert.equal(await page.locator("#apply-import").isDisabled(), true);
    await page.locator("#cancel-import").click();
    assert.match(await page.locator(".card").innerText(), /literal only/);
    await page.locator("#import").setInputFiles({
      name: "good.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(example)),
    });
    await page.locator("#replace-confirm").check();
    await page.locator("#apply-import").click();
    assert.equal(await page.locator(".card").count(), 1);
    assert.doesNotMatch(
      await page.locator(".card").innerText(),
      /literal only/,
    );
    await page.locator("#import").setInputFiles({
      name: "preview.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(example)),
    });
    await page.locator("#import-preview").waitFor({ state: "visible" });
    await page.locator(".card button").first().click();
    await page.locator("#notes").fill("Changed after preview");
    await page.locator("#save").click();
    assert.equal(await page.locator("#import-preview").isHidden(), true);
    await page.evaluate(() => {
      const original = File.prototype.text;
      File.prototype.text = async function () {
        const data = await original.call(this);
        if (this.name === "slow.json")
          await new Promise((r) => (window.releaseImport = r));
        return data;
      };
    });
    const slow = structuredClone(example);
    slow.records[0].notes = "Older slow import";
    const fast = structuredClone(example);
    fast.records[0].notes = "Latest import";
    await page.locator("#import").setInputFiles({
      name: "slow.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(slow)),
    });
    await page.locator("#import").setInputFiles({
      name: "fast.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fast)),
    });
    await page.locator("#import-preview").waitFor({ state: "visible" });
    await page.evaluate(() => window.releaseImport());
    await page.waitForTimeout(60);
    await page.locator("#replace-confirm").check();
    await page.locator("#apply-import").click();
    assert.match(await page.locator(".card").innerText(), /Latest import/);
    await page.evaluate(() => {
      const original = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = async function () {
        await original.call(this);
        await new Promise((r) => (window.releasePhoto = r));
      };
    });
    await page.locator("#photo").setInputFiles({
      name: "slow.png",
      mimeType: "image/png",
      buffer: photoBuffer,
    });
    await page.waitForFunction(() => typeof window.releasePhoto === "function");
    page.once("dialog", (d) => d.accept());
    await page.locator("#cancel-edit").click();
    await page.evaluate(() => window.releasePhoto());
    await page.waitForTimeout(60);
    assert.equal(await page.locator("#photo-preview").isHidden(), true);
    await page.reload();
    await page.locator(".card button").first().click();
    await page.locator("#photo").setInputFiles({
      name: "tiny.png",
      mimeType: "image/png",
      buffer: photoBuffer,
    });
    await page.waitForFunction(
      () => !document.querySelector("#photo-preview").hidden,
    );
    await page.locator("#save").click();
    assert.equal(await page.locator(".card>img").count(), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(output, browserName + "-narrow.png"),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.locator(".panel").isVisible(), false);
    await page.screenshot({
      path: path.join(output, browserName + "-print.png"),
      fullPage: true,
    });
    if (browserName === "chromium")
      await page.pdf({
        path: path.join(output, "print.pdf"),
        format: "A4",
        printBackground: true,
      });
    await page.emulateMedia({ media: "screen" });
    const other = await context.newPage();
    await other.goto(base);
    await other.evaluate(
      ({ key }) => localStorage.setItem(key, localStorage.getItem(key) + " "),
      { key: config.slug + ":v1" },
    );
    await page.waitForFunction(() => document.querySelector("#save").disabled);
    assert.match(await page.locator("#status").innerText(), /another tab/i);
    await other.close();
    await page.reload();
    const before = await page.evaluate(
      (key) => localStorage.getItem(key),
      config.slug + ":v1",
    );
    await page.locator(".card button").first().click();
    await page.locator("#notes").fill("Will fail to persist");
    await page.evaluate(() => {
      Storage.prototype.setItem = function () {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      };
    });
    await page.locator("#save").click();
    assert.match(await page.locator("#status").innerText(), /Not saved/);
    assert.equal(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        config.slug + ":v1",
      ),
      before,
    );
    page.once("dialog", (d) => d.accept());
    await page.reload();
    await page.evaluate(
      (key) => localStorage.setItem(key, "{unreadable"),
      config.slug + ":v1",
    );
    await page.reload();
    assert.equal(await page.locator("#save").isDisabled(), true);
    assert.equal(await page.locator("#export").isDisabled(), true);
    const [raw] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#raw").click(),
    ]);
    assert.equal(await fs.readFile(await raw.path(), "utf8"), "{unreadable");
    await page.locator("#import").setInputFiles({
      name: "restore.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(example)),
    });
    assert.equal(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        config.slug + ":v1",
      ),
      "{unreadable",
    );
    await page.locator("#replace-confirm").check();
    await page.locator("#apply-import").click();
    assert.equal(await page.locator("#save").isEnabled(), true);
    assert.deepEqual(errors, []);
    await context.close();
    const fileContext = await browser.newContext({ offline: true });
    const filePage = await fileContext.newPage();
    await filePage.goto(
      pathToFileURL(path.join(root, "verification/extracted/index.html")).href,
    );
    await filePage.locator("#example").click();
    await filePage.locator("#save").click();
    assert.equal(await filePage.locator(".card").count(), 1);
    await filePage.reload();
    assert.equal(await filePage.locator(".card").count(), 1);
    await fileContext.close();
    await browser.close();
    results.push({
      browser: browserName,
      status: "passed",
      flows:
        "source add/edit/persist/search/download/delete/undo/import/photo/narrow/print/stale/quota/corrupt recovery; exact ZIP file protocol offline",
    });
  }
  await fs.writeFile(
    path.join(output, "browser-results.json"),
    JSON.stringify({ project: config.slug, results }, null, 2) + "\n",
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  server.close();
}
