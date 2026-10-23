import fs from "node:fs";
import path from "node:path";
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
fs.mkdirSync("dist", { recursive: true });
let html = fs
  .readFileSync("index.html", "utf8")
  .replace(
    /<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']src\/styles\.css["'])[^>]*\/?>/i,
    () => "<style>" + fs.readFileSync("src/styles.css", "utf8") + "</style>",
  );
const core = fs
  .readFileSync("src/core.js", "utf8")
  .replace(/^export\s+(?=(?:const|let|function|class)\b)/gm, "");
const app = fs
  .readFileSync("src/app.js", "utf8")
  .replace(/^import\s*\{[\s\S]*?\}\s*from\s*["']\.\/core\.js["'];?\s*/m, "");
html = html.replace(
  /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']src\/app\.js["'])[^>]*>\s*<\/script\s*>/i,
  () => '<script type="module">' + core + "\n" + app + "</script>",
);
fs.writeFileSync("dist/index.html", html);
fs.mkdirSync("dist/site", { recursive: true });
fs.writeFileSync("dist/site/index.html", html);
const entries = [["index.html", Buffer.from(html)]];
for (const dir of ["src", "examples", "scripts", "test"])
  for (const name of fs.readdirSync(dir).sort())
    entries.push([dir + "/" + name, fs.readFileSync(path.join(dir, name))]);
for (const name of [
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "DEVELOPMENT.md",
  "TESTING.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "product.json",
  "package.json",
  "package-lock.json",
  "browser-acceptance.mjs",
])
  entries.push([name, fs.readFileSync(name)]);
// Preserve the original module entry point and complete development surface.
// The root entry point remains the ready-to-open offline application.
function addSource(relative) {
  const info = fs.lstatSync(relative);
  if (info.isSymbolicLink())
    throw Error("Source packaging refuses symlinks: " + relative);
  if (info.isDirectory()) {
    for (const name of fs.readdirSync(relative).sort())
      addSource(path.join(relative, name));
  } else if (info.isFile()) {
    entries.push([
      "source/" + relative.split(path.sep).join("/"),
      fs.readFileSync(relative),
    ]);
  }
}
for (const relative of [
  "index.html",
  "package.json",
  "package-lock.json",
  "product.json",
  "browser-acceptance.mjs",
  ".gitignore",
  ".gitattributes",
  ".prettierignore",
  ".github",
  "src",
  "scripts",
  "test",
  "examples",
  ...fs
    .readdirSync(".")
    .filter((name) => name.endsWith(".md"))
    .sort(),
  "LICENSE",
]) {
  if (fs.existsSync(relative)) addSource(relative);
}
function crc32(b) {
  let crc = 0xffffffff;
  for (const n of b) {
    crc ^= n;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
let offset = 0;
const parts = [],
  central = [];
for (const [name, data] of entries) {
  const n = Buffer.from(name),
    crc = crc32(data),
    h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(0x800, 6);
  h.writeUInt16LE(33, 12);
  h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(data.length, 18);
  h.writeUInt32LE(data.length, 22);
  h.writeUInt16LE(n.length, 26);
  parts.push(h, n, data);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0);
  c.writeUInt16LE(20, 4);
  c.writeUInt16LE(20, 6);
  c.writeUInt16LE(0x800, 8);
  c.writeUInt16LE(33, 14);
  c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(data.length, 20);
  c.writeUInt32LE(data.length, 24);
  c.writeUInt16LE(n.length, 28);
  c.writeUInt32LE(offset, 42);
  central.push(c, n);
  offset += h.length + n.length + data.length;
}
const cent = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(cent.length, 12);
end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...parts, cent, end]);
const output = `dist/${pkg.name}-${pkg.version}.zip`;
fs.writeFileSync(output, zip);
const { createHash } = await import("node:crypto");
fs.writeFileSync(
  "dist/SHA256SUMS",
  createHash("sha256").update(zip).digest("hex") +
    "  " +
    path.basename(output) +
    "\n",
);
console.log(output + " (" + zip.length + " bytes)");
