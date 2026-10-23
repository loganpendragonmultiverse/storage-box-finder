export const MAX_RECORDS = 150;
export const MAX_BACKUP_BYTES = 12 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 250000;
export const MAX_PHOTO_PIXELS = 25_000_000;
export function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (y < 1900 || y > 9999) return false;
  const v = new Date(0);
  v.setUTCFullYear(y, m - 1, d);
  v.setUTCHours(0, 0, 0, 0);
  return (
    v.getUTCFullYear() === y &&
    v.getUTCMonth() === m - 1 &&
    v.getUTCDate() === d
  );
}
export function photoValid(s) {
  if (s === "") return true;
  if (typeof s !== "string" || s.length > MAX_PHOTO_BYTES * 1.38) return false;
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);
  if (!match || match[2].length % 4 !== 0) return false;
  let b;
  try {
    b = atob(match[2]);
  } catch {
    return false;
  }
  if (b.length > MAX_PHOTO_BYTES) return false;
  const byte = (i) => b.charCodeAt(i);
  const u16 = (i) => (byte(i) << 8) | byte(i + 1);
  const u32 = (i) =>
    byte(i) * 16777216 + byte(i + 1) * 65536 + byte(i + 2) * 256 + byte(i + 3);
  let width = 0,
    height = 0;
  if (match[1] === "png") {
    if (
      b.length < 33 ||
      !b.startsWith("\x89PNG\r\n\x1a\n") ||
      u32(8) !== 13 ||
      b.slice(12, 16) !== "IHDR"
    )
      return false;
    width = u32(16);
    height = u32(20);
  } else if (match[1] === "jpeg") {
    if (!b.startsWith("\xff\xd8\xff")) return false;
    for (let i = 2; i < b.length - 8;) {
      if (byte(i) !== 255) break;
      while (byte(i) === 255) i++;
      const marker = byte(i++);
      if (marker === 217 || marker === 218) break;
      if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215))
        continue;
      const length = u16(i);
      if (length < 2 || i + length > b.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 8
      ) {
        height = u16(i + 3);
        width = u16(i + 5);
        break;
      }
      i += length;
    }
  } else {
    if (b.length < 30 || !b.startsWith("RIFF") || b.slice(8, 12) !== "WEBP")
      return false;
    const kind = b.slice(12, 16);
    if (kind === "VP8X") {
      width = 1 + byte(24) + byte(25) * 256 + byte(26) * 65536;
      height = 1 + byte(27) + byte(28) * 256 + byte(29) * 65536;
    } else if (kind === "VP8 " && b.slice(23, 26) === "\x9d\x01\x2a") {
      width = (byte(26) + byte(27) * 256) & 16383;
      height = (byte(28) + byte(29) * 256) & 16383;
    } else if (kind === "VP8L" && byte(20) === 47) {
      width = 1 + byte(21) + ((byte(22) & 63) << 8);
      height = 1 + (byte(22) >> 6) + (byte(23) << 2) + ((byte(24) & 15) << 10);
    }
  }
  return width > 0 && height > 0 && width * height <= MAX_PHOTO_PIXELS;
}
export function validateRecord(record, config) {
  if (!record || typeof record !== "object" || Array.isArray(record))
    throw Error("Each entry must be an object.");
  const allowed = ["id", "photo", ...config.fields.map((x) => x[0])];
  if (Object.keys(record).some((k) => !allowed.includes(k)))
    throw Error("An entry contains an unsupported field.");
  if (typeof record.id !== "string" || !/^[A-Za-z0-9-]{1,80}$/.test(record.id))
    throw Error("An entry has an invalid identifier.");
  const out = { id: record.id };
  for (const [key, label, type, required] of config.fields) {
    const value = record[key];
    if (
      typeof value !== "string" ||
      value.length > (type === "textarea" ? 5000 : 300)
    )
      throw Error(`${label}: expected text within the displayed limits.`);
    if (required && !value.trim()) throw Error(`${label} is required.`);
    if (type === "date" && value && !validDate(value))
      throw Error(`${label}: enter a real date between 1900 and 9999.`);
    if (type === "url" && value) {
      let url;
      try {
        url = new URL(value);
      } catch {
        throw Error(`${label}: enter a full http:// or https:// address.`);
      }
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw Error(
          `${label}: only HTTP(S) links without embedded credentials are accepted.`,
        );
    }
    out[key] = value;
  }
  out.photo = record.photo ?? "";
  if (!photoValid(out.photo))
    throw Error(
      "Photo must be a PNG, JPEG or WebP image with readable dimensions (maximum 250 KB and 25 million pixels).",
    );
  return out;
}
export function validateBackup(value, config) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.format !== config.slug ||
    value.version !== 1 ||
    !Array.isArray(value.records) ||
    Object.keys(value).some(
      (k) => !["format", "version", "records"].includes(k),
    )
  )
    throw Error("This is not a supported backup for this tool.");
  if (value.records.length > MAX_RECORDS)
    throw Error(`A backup can contain at most ${MAX_RECORDS} entries.`);
  const records = value.records.map((r) => validateRecord(r, config));
  if (new Set(records.map((r) => r.id)).size !== records.length)
    throw Error("Backup contains duplicate entry identifiers.");
  if (
    config.slug === "storage-box-finder" &&
    new Set(records.map((r) => r.number.trim().toLocaleLowerCase())).size !==
      records.length
  )
    throw Error("Box numbers must be unique.");
  return records;
}
export function parseBackup(text, config) {
  if (
    typeof text !== "string" ||
    new TextEncoder().encode(text).length > MAX_BACKUP_BYTES
  )
    throw Error("Backup is too large (maximum 12 MB).");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error(
      "Backup is not valid JSON. Your current entries have not changed.",
    );
  }
  return validateBackup(value, config);
}
export function serialize(records, config) {
  const value = { format: config.slug, version: 1, records };
  validateBackup(value, config);
  const text = JSON.stringify(value, null, 2);
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES)
    throw Error(
      "Library exceeds the 12 MB backup limit. Remove or reduce photos after exporting a backup.",
    );
  return text;
}
export function searchRecords(records, query) {
  const q = query.trim().toLocaleLowerCase();
  return records.filter((r) =>
    Object.entries(r).some(
      ([k, v]) =>
        k !== "photo" && k !== "id" && v.toLocaleLowerCase().includes(q),
    ),
  );
}
export function saveChecked(storage, key, baseline, next) {
  if (storage.getItem(key) !== baseline)
    throw Error(
      "Another tab changed this library. Copy unsaved form text and keep the original photo before reloading. Backup export includes saved entries only.",
    );
  storage.setItem(key, next);
  return next;
}
