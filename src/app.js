import {
  parseBackup,
  serialize,
  validateRecord,
  searchRecords,
  saveChecked,
  MAX_BACKUP_BYTES,
  MAX_PHOTO_PIXELS,
} from "./core.js";
const config = JSON.parse(
  document.getElementById("product-config").textContent,
);
const $ = (id) => document.getElementById(id),
  key = config.slug + ":v1";
let records = [],
  baseline = null,
  blocked = false,
  unreadable = false,
  photo = "",
  editing = null,
  undo = null,
  pending = null,
  dirty = false,
  photoPending = false,
  photoEpoch = 0,
  importEpoch = 0;
const el = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
function announce(message, error = false) {
  $("status").textContent = message;
  $("status").className = error ? "status error" : "status";
}
function download(name, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function readStorage() {
  blocked = true;
  unreadable = true;
  $("import").disabled = true;
  updateButtons();
  try {
    baseline = localStorage.getItem(key);
    const incoming = baseline === null ? [] : parseBackup(baseline, config);
    await checkImportedPhotos(incoming, importEpoch);
    if (localStorage.getItem(key) !== baseline)
      throw Error(
        "Saved data changed while loading. Reload to read the current library.",
      );
    records = incoming;
    blocked = false;
    unreadable = false;
    announce(
      records.length
        ? `${records.length} entries loaded from this browser.`
        : "Ready. Add your first entry, or try the example.",
    );
  } catch (e) {
    blocked = true;
    unreadable = true;
    $("recovery").hidden = false;
    announce(
      "Saved data could not be read. It has been preserved. Download the original bytes before restoring a valid backup. " +
        e.message,
      true,
    );
  } finally {
    $("import").disabled = false;
  }
}
function persist(next, message) {
  if (blocked && !pending)
    throw Error(
      "Saving is blocked to protect unreadable or changed data. Restore a reviewed backup or reload.",
    );
  const text = serialize(next, config);
  baseline = saveChecked(localStorage, key, baseline, text);
  records = next;
  if (next !== pending) {
    importEpoch++;
    pending = null;
    $("import-preview").hidden = true;
  }
  blocked = false;
  unreadable = false;
  $("recovery").hidden = true;
  announce(message);
  render();
}
function markDirty() {
  dirty = true;
}
function clearEditor(force = false) {
  if (!force && dirty && !confirm("Discard the unsaved changes in this form?"))
    return false;
  photoEpoch++;
  photoPending = false;
  $("editor").reset();
  editing = null;
  photo = "";
  dirty = false;
  $("photo-preview").hidden = true;
  $("remove-photo").hidden = true;
  $("editor-title").textContent = "Add " + config.item;
  $("save").textContent = "Save " + config.item;
  updateButtons();
  return true;
}
function fillEditor(record) {
  if (!clearEditor()) return;
  editing = record.id;
  for (const [k] of config.fields) $(k).value = record[k];
  photo = record.photo;
  showPhoto();
  $("editor-title").textContent = "Edit " + config.item;
  $("save").textContent = "Save changes";
  $(config.fields[0][0]).focus();
}
function showPhoto() {
  $("photo-preview").hidden = !photo;
  $("remove-photo").hidden = !photo;
  if (photo) $("photo-preview").src = photo;
}
function render() {
  const found = searchRecords(records, $("search").value);
  $("count").textContent = `${found.length} of ${records.length} entries`;
  $("cards").replaceChildren();
  $("empty").hidden = found.length > 0;
  for (const r of found) {
    const card = el("article", undefined, "card");
    const select = el("label", undefined, "print-choice");
    const check = el("input");
    check.type = "checkbox";
    check.dataset.id = r.id;
    check.checked = true;
    select.append(check, document.createTextNode("Include in print"));
    card.append(select);
    const title =
      config.slug === "storage-box-finder"
        ? `Box ${r.number} · ${r.name}`
        : r.name;
    card.append(el("h3", title));
    if (r.photo) {
      const im = el("img");
      im.src = r.photo;
      im.alt = "Reference photo for " + title;
      im.loading = "lazy";
      card.append(im);
    }
    const dl = el("dl");
    for (const [k, label] of config.fields) {
      if (
        !r[k] ||
        k === "name" ||
        (config.slug === "storage-box-finder" && k === "number")
      )
        continue;
      dl.append(el("dt", label));
      const dd = el("dd");
      if (k === "link") {
        const a = el("a", r[k]);
        a.href = r[k];
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        dd.append(a);
      } else dd.textContent = r[k];
      dl.append(dd);
    }
    card.append(dl);
    const actions = el("div", undefined, "card-actions");
    const edit = el("button", "Edit");
    edit.type = "button";
    edit.addEventListener("click", () => fillEditor(r));
    const del = el("button", "Delete", "danger");
    del.type = "button";
    del.addEventListener("click", () => {
      if (
        !confirm(
          `Delete ${title}? You can undo the latest deletion until your next change.`,
        )
      )
        return;
      try {
        const old = records;
        persist(
          records.filter((x) => x.id !== r.id),
          "Entry deleted. Undo is available.",
        );
        if (editing === r.id) clearEditor(true);
        undo = old;
        $("undo").disabled = false;
      } catch (e) {
        announce(e.message, true);
      }
    });
    actions.append(edit, del);
    card.append(actions);
    $("cards").append(card);
  }
  updateButtons();
}
function updateButtons() {
  $("save").disabled = blocked || photoPending;
  $("export").disabled = unreadable;
  $("print").disabled = !records.length;
  $("select-all").disabled = !records.length;
}
function clearUndo() {
  undo = null;
  $("undo").disabled = true;
}
for (const [k, label, type, required] of config.fields) {
  const wrap = el("label");
  wrap.htmlFor = k;
  wrap.append(el("span", label + (required ? " *" : "")));
  const input = el(type === "textarea" ? "textarea" : "input");
  input.id = k;
  input.name = k;
  if (type !== "textarea") input.type = type;
  input.required = required;
  input.maxLength = type === "textarea" ? 5000 : 300;
  if (type === "date") {
    input.min = "1900-01-01";
    input.max = "9999-12-31";
  }
  if (k === "contents") input.rows = 5;
  wrap.append(input);
  $("fields").append(wrap);
}
$("editor").addEventListener("input", markDirty);
$("editor").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    const record = { id: editing || crypto.randomUUID(), photo };
    for (const [k] of config.fields) record[k] = $(k).value;
    const valid = validateRecord(record, config);
    const next = editing
      ? records.map((r) => (r.id === editing ? valid : r))
      : [...records, valid];
    persist(
      next,
      "Saved in this browser. Export a backup to keep a separate copy.",
    );
    clearUndo();
    clearEditor(true);
  } catch (e) {
    announce("Not saved. " + e.message, true);
  }
});
$("cancel-edit").addEventListener("click", () => clearEditor());
$("example").addEventListener("click", () => {
  if (!clearEditor()) return;
  for (const [k, v] of Object.entries(config.example)) $(k).value = v;
  dirty = true;
  announce("Example loaded into the form. Review it, then save if useful.");
});
$("photo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  const ticket = ++photoEpoch;
  if (!file) return;
  photoPending = true;
  updateButtons();
  try {
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 8 * 1024 * 1024
    )
      throw Error("Choose a PNG, JPEG or WebP photo under 8 MB.");
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (ticket !== photoEpoch) return;
      if (img.width * img.height > 40000000)
        throw Error("Photo is too large to process. Choose a smaller image.");
      const canvas = document.createElement("canvas"),
        ratio = Math.min(1, 1000 / img.width, 1000 / img.height);
      canvas.width = Math.max(1, Math.round(img.width * ratio));
      canvas.height = Math.max(1, Math.round(img.height * ratio));
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      let result = canvas.toDataURL("image/jpeg", 0.75);
      if (result.length > 330000) {
        canvas.width = Math.round(canvas.width / 2);
        canvas.height = Math.round(canvas.height / 2);
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        result = canvas.toDataURL("image/jpeg", 0.65);
      }
      if (result.length > 330000)
        throw Error("Photo remains too large. Try a simpler or smaller photo.");
      photo = result;
      dirty = true;
      showPhoto();
      announce("Photo prepared locally. Save the entry to keep it.");
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    if (ticket === photoEpoch) announce(err.message, true);
  } finally {
    if (ticket === photoEpoch) {
      e.target.value = "";
      photoPending = false;
      updateButtons();
    }
  }
});
$("remove-photo").addEventListener("click", () => {
  photoEpoch++;
  photoPending = false;
  photo = "";
  dirty = true;
  showPhoto();
  updateButtons();
});
$("search").addEventListener("input", render);
$("export").addEventListener("click", () => {
  try {
    if (unreadable)
      throw Error("Download original bytes from the recovery panel instead.");
    download(config.slug + "-backup.json", serialize(records, config));
    announce(
      "Backup downloaded. Keep it somewhere separate from this browser. Unsaved form changes are not included.",
    );
  } catch (e) {
    announce(e.message, true);
  }
});
$("raw").addEventListener("click", () => {
  if (baseline !== null)
    download(config.slug + "-original-storage.txt", baseline, "text/plain");
  else
    announce(
      "Storage access is unavailable; no original bytes could be read.",
      true,
    );
});
async function checkImportedPhotos(incoming, ticket) {
  for (const record of incoming) {
    if (ticket !== importEpoch) return;
    if (!record.photo) continue;
    await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (
          !image.naturalWidth ||
          !image.naturalHeight ||
          image.naturalWidth * image.naturalHeight > MAX_PHOTO_PIXELS
        )
          reject(
            Error(
              "An imported photo exceeds the supported dimensions. Nothing was changed.",
            ),
          );
        else resolve();
      };
      image.onerror = () =>
        reject(
          Error("An imported photo cannot be decoded. Nothing was changed."),
        );
      image.src = record.photo;
    });
  }
}
$("import").addEventListener("change", async (e) => {
  const file = e.target.files[0],
    ticket = ++importEpoch;
  pending = null;
  $("import-preview").hidden = true;
  if (!file) return;
  try {
    if (file.size > MAX_BACKUP_BYTES)
      throw Error("Backup is too large (maximum 12 MB).");
    const incoming = parseBackup(await file.text(), config);
    if (ticket !== importEpoch) return;
    await checkImportedPhotos(incoming, ticket);
    if (ticket !== importEpoch) return;
    pending = incoming;
    $("import-summary").textContent =
      `This backup has ${incoming.length} entries. Applying it replaces all ${records.length} current entries, including photos. It does not merge. Unsaved form changes will be discarded. Export your current library first.`;
    $("replace-confirm").checked = false;
    $("apply-import").disabled = true;
    $("import-preview").hidden = false;
    $("replace-confirm").focus();
  } catch (err) {
    if (ticket === importEpoch) {
      pending = null;
      announce(err.message, true);
    }
  } finally {
    if (ticket === importEpoch) e.target.value = "";
  }
});
$("replace-confirm").addEventListener(
  "change",
  () => ($("apply-import").disabled = !$("replace-confirm").checked),
);
$("cancel-import").addEventListener("click", () => {
  importEpoch++;
  pending = null;
  $("import-preview").hidden = true;
  announce("Import cancelled. Your entries have not changed.");
});
$("apply-import").addEventListener("click", () => {
  if (!pending || !$("replace-confirm").checked) return;
  try {
    persist(pending, "Backup restored and saved in this browser.");
    importEpoch++;
    pending = null;
    $("import-preview").hidden = true;
    clearUndo();
    clearEditor(true);
  } catch (e) {
    announce("Import was not applied. " + e.message, true);
  }
});
$("undo").addEventListener("click", () => {
  if (!undo) return;
  try {
    persist(undo, "Deletion undone.");
    clearUndo();
  } catch (e) {
    announce(e.message, true);
  }
});
$("select-all").addEventListener("click", () => {
  const boxes = [...$("cards").querySelectorAll("input[type=checkbox]")];
  const all = boxes.every((x) => x.checked);
  for (const x of boxes) x.checked = !all;
});
$("print").addEventListener("click", () => {
  const selected = new Set(
    [...$("cards").querySelectorAll("input:checked")].map((x) => x.dataset.id),
  );
  if (!selected.size) {
    announce("Select at least one visible entry to print.", true);
    return;
  }
  for (const card of $("cards").children)
    card.classList.toggle("skip-print", !card.querySelector("input").checked);
  window.print();
});
window.addEventListener("storage", (e) => {
  if (e.key === key || e.key === null) {
    blocked = true;
    announce(
      "This library changed in another tab. Copy unsaved form text and keep the original photo before reloading. Backup export includes saved entries only.",
      true,
    );
    updateButtons();
  }
});
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
await readStorage();
render();
