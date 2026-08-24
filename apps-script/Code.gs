/**
 * Tower Drive dossiers — Google Apps Script web app.
 *
 * Two jobs, both over POST, both authenticated with the same shared secret:
 *
 *   {id, secret}                  -> {id, url, folderId}   find-or-create the folder
 *   {action:"files", id, secret}  -> {id, files:[...]}      list what's in it
 *   {action:"file",  id, name, secret} -> {name,size,sha256,b64}  one file's bytes
 *
 * The caller is server.mjs in the fleet dashboard (see driveHook() there), which
 * holds the secret server-side. Nothing here is reachable by a browser.
 *
 * DEPLOY: Deploy > New deployment > Web app, "Execute as: me".
 * AFTER EDITING: Manage deployments > edit > New version. Saving the editor does
 * NOT change what the /exec URL serves — check /exec in a browser, it reports the
 * VERSION below so you can tell whether your redeploy actually landed.
 */

const PARENT_ID = '1kcI2n9_a8173MAo_FFkGydqpFTG4SEdP';

// Must be non-empty and must match DRIVE_HOOK_SECRET on the dashboard server.
// An empty value here refuses every request (fail closed) rather than waving
// them through.
const SECRET = '';

const BINARY_EXTS = ['.bin', '.elf'];

const VERSION = '2026-08-24-files';

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/** A browser hitting /exec gets this — handy for confirming a redeploy landed. */
function doGet() {
  return json({ ok: true, version: VERSION, note: 'POST-only endpoint' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // One auth gate for every action. Fail closed on an unset secret.
    if (!SECRET || body.secret !== SECRET) return json({ error: 'unauthorized' });

    const id = String(body.id || '').trim();
    if (!id) return json({ error: 'missing id' });

    if (body.action === 'files') {
      const files = listTowerFiles_(id);
      if (files === null) return json({ error: 'no Drive folder named "' + id + '"' });
      return json({ id: id, files: files });
    }

    if (body.action === 'file') {
      const name = String(body.name || '').trim();
      if (!name) return json({ error: 'missing file name' });
      const file = readTowerFile_(id, name);
      if (!file) return json({ error: 'no file "' + name + '" in "' + id + '"' });
      return json(file);
    }

    // Default: provision. Locked, because two concurrent posts for the same id
    // would otherwise both miss the lookup and both create a folder — Drive
    // happily allows two folders with the same name, and then a file lookup
    // finds whichever it hits first.
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const parent = DriveApp.getFolderById(PARENT_ID);
      const existing = parent.getFoldersByName(id);
      const folder = existing.hasNext() ? existing.next() : parent.createFolder(id);
      return json({ id: id, url: folder.getUrl(), folderId: folder.getId() });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json({ error: String(err) });
  }
}

/** The folder for one tower, matched by exact name under the fleet parent. */
function towerFolder_(id) {
  const it = DriveApp.getFolderById(PARENT_ID).getFoldersByName(id);
  return it.hasNext() ? it.next() : null;
}

function extOf_(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.substring(i).toLowerCase();
}

/** Classify a file so the UI can label and order it. ".env", ".env.production"
 *  and "tower.env" all count as config; .bin/.elf as the firmware image. */
function kindOf_(name) {
  const lower = name.toLowerCase();
  if (BINARY_EXTS.indexOf(extOf_(name)) !== -1) return 'binary';
  if (lower === '.env' || lower.indexOf('.env') === 0 || extOf_(name) === '.env') return 'env';
  return 'other';
}

function sha256Hex_(bytes) {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  let out = '';
  for (let i = 0; i < d.length; i++) {
    const b = d[i] < 0 ? d[i] + 256 : d[i];
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

/** Everything in a tower's folder. Returns null when the folder is missing, so
 *  "unknown tower" reads differently from "folder is empty". */
function listTowerFiles_(id) {
  const folder = towerFolder_(id);
  if (!folder) return null;
  const out = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const name = f.getName();
    out.push({
      name: name,
      kind: kindOf_(name),
      size: f.getSize(),
      updated: f.getLastUpdated().toISOString(),
    });
  }
  return out;
}

/** One file's bytes, base64'd for transport. The dashboard server decodes and
 *  streams it, so the browser never handles base64. */
function readTowerFile_(id, name) {
  const folder = towerFolder_(id);
  if (!folder) return null;
  const it = folder.getFilesByName(name);
  if (!it.hasNext()) return null;
  const bytes = it.next().getBlob().getBytes();
  return {
    name: name,
    size: bytes.length,
    sha256: sha256Hex_(bytes),
    b64: Utilities.base64Encode(bytes),
  };
}
