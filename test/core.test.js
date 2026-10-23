import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  validateRecord,
  parseBackup,
  serialize,
  searchRecords,
  saveChecked,
  validDate,
  photoValid,
} from "../src/core.js";
const config = JSON.parse(fs.readFileSync("product.json", "utf8"));
const record = { id: "example-1", photo: "", ...config.example };
test("portable backup round trip preserves text and no executable interpretation", () => {
  const r = { ...record, notes: '<script>alert(1)</script>\nquoted "text"' };
  assert.deepEqual(parseBackup(serialize([r], config), config), [r]);
});
test("invalid, foreign, duplicate and unknown fields fail before accepting a backup", () => {
  assert.throws(() => parseBackup("{", config));
  assert.throws(() =>
    parseBackup(
      JSON.stringify({ format: "other", version: 1, records: [] }),
      config,
    ),
  );
  assert.throws(() => serialize([record, record], config));
  assert.throws(() => validateRecord({ ...record, unexpected: true }, config));
  assert.throws(() =>
    validateRecord({ ...record, [config.fields[0][0]]: "" }, config),
  );
});
test("search includes authored fields but excludes photo payload and IDs", () => {
  assert.equal(
    searchRecords([record], config.example.name.toUpperCase()).length,
    1,
  );
  assert.equal(searchRecords([record], "EXAMPLE-1").length, 0);
  assert.equal(searchRecords([record], "no-such-value").length, 0);
});
test("stale writes and storage failure preserve the existing library", () => {
  let value = "current";
  const store = {
    getItem: () => value,
    setItem: (k, v) => {
      value = v;
    },
  };
  assert.throws(() => saveChecked(store, "k", "old", "new"), /Another tab/);
  assert.equal(value, "current");
  assert.equal(saveChecked(store, "k", "current", "new"), "new");
  assert.equal(value, "new");
  const failing = {
    getItem: () => value,
    setItem: () => {
      throw Error("quota");
    },
  };
  assert.throws(() => saveChecked(failing, "k", "new", "replacement"), /quota/);
  assert.equal(value, "new");
});
test("photos reject remote, SVG, invalid data, mismatched formats and oversized payloads", () => {
  assert.equal(photoValid(""), true);
  for (const s of [
    "https://example.com/a.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,YWJj",
    "data:image/jpeg;base64," + "A".repeat(400000),
  ])
    assert.equal(photoValid(s), false);
});
test("dates reject impossible days and accept leap days with a bounded calendar", () => {
  assert.equal(validDate("2024-02-29"), true);
  for (const s of [
    "2023-02-29",
    "2024-02-30",
    "2024-13-01",
    "0099-01-01",
    "2024-1-01",
  ])
    assert.equal(validDate(s), false);
});
test("photo metadata rejects truncated headers and excessive dimensions before decoding", () => {
  assert.equal(photoValid("data:image/png;base64,iVBORw0KGgo="), false);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA9sAAAAASUVORK5CYII=",
    "base64",
  );
  assert.equal(
    photoValid("data:image/png;base64," + png.toString("base64")),
    true,
  );
  for (const dimension of [0, 50000]) {
    const oversized = Buffer.from(png);
    oversized.writeUInt32BE(dimension, 16);
    oversized.writeUInt32BE(dimension, 20);
    const photo = "data:image/png;base64," + oversized.toString("base64");
    assert.equal(photoValid(photo), false);
    assert.throws(
      () =>
        parseBackup(
          JSON.stringify({
            format: config.slug,
            version: 1,
            records: [{ ...record, photo }],
          }),
          config,
        ),
      /readable dimensions/,
    );
  }
  const jpeg = Buffer.from([
    255, 216, 255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0,
  ]);
  assert.equal(
    photoValid("data:image/jpeg;base64," + jpeg.toString("base64")),
    true,
  );
  jpeg[7] = 255;
  jpeg[8] = 255;
  jpeg[9] = 255;
  jpeg[10] = 255;
  assert.equal(
    photoValid("data:image/jpeg;base64," + jpeg.toString("base64")),
    false,
  );
  const webp = Buffer.alloc(30);
  webp.write("RIFF", 0);
  webp.write("WEBPVP8X", 8);
  assert.equal(
    photoValid("data:image/webp;base64," + webp.toString("base64")),
    true,
  );
  webp.fill(255, 24, 30);
  assert.equal(
    photoValid("data:image/webp;base64," + webp.toString("base64")),
    false,
  );
});
test("limits and wrong field types are rejected", () => {
  assert.throws(() =>
    validateRecord({ ...record, notes: "x".repeat(5001) }, config),
  );
  assert.throws(() => validateRecord({ ...record, notes: 45 }, config));
  assert.throws(
    () => parseBackup("x".repeat(13 * 1024 * 1024), config),
    /too large/,
  );
});
if (config.slug === "storage-box-finder")
  test("box numbers are unique ignoring case and surrounding spaces", () => {
    assert.throws(
      () =>
        serialize(
          [
            record,
            {
              ...record,
              id: "two",
              number: " " + record.number.toLowerCase() + " ",
            },
          ],
          config,
        ),
      /unique/,
    );
  });
if (config.slug === "household-replacement-reference")
  test("links must be complete http(s) addresses without credentials", () => {
    for (const link of [
      "javascript:alert(1)",
      "file:///tmp/secret",
      "https://user:pass@example.com",
    ])
      assert.throws(() => validateRecord({ ...record, link }, config));
    assert.equal(
      validateRecord(
        { ...record, link: "https://example.com/part?a=1" },
        config,
      ).link,
      "https://example.com/part?a=1",
    );
  });
if (config.slug === "opened-date-labels")
  test("manufacturer guidance is literal and opening date is validated", () => {
    const r = validateRecord(
      { ...record, guidance: "Use the manufacturer instructions exactly." },
      config,
    );
    assert.equal(r.guidance, "Use the manufacturer instructions exactly.");
    assert.throws(() =>
      validateRecord({ ...record, opened: "2026-02-30" }, config),
    );
    assert.equal("expires" in r, false);
  });
