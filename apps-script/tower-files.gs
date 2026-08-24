/**
 * Tower file dispenser — addition to the existing Drive provisioning Code.gs.
 *
 * WIRING (two steps, nothing else changes):
 *
 *  1. Paste this whole file at the end of Code.gs.
 *  2. Add these two lines as the FIRST statements inside your existing doPost(e):
 *
 *         var early = handleFileActions_(e);
 *         if (early) return early;
 *
 * Requests without an "action" field fall straight through to the original
 * find-or-create provisioning path, so the contract server.mjs already depends
 * on (POST {id, secret} -> {url}) is untouched.
 *
 * Actions:
 *   POST {action:"files", id, secret}        -> {id, files:[{name,kind,size,updated}]}
 *   POST {action:"file",  id, name, secret}  -> {name, size, sha256, b64}
 *
 * Assumes PARENT_ID, SECRET and BINARY_EXTS are already defined at the top of
 * Code.gs. If BINARY_EXTS isn't there, add:  var BINARY_EXTS = ['.bin', '.elf'];
 */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/** The folder for one tower, matched by exact name under the fleet parent.
 *  Returns null if there isn't one. */
function towerFolder_(id) {
  var it = DriveApp.getFolderById(PARENT_ID).getFoldersByName(id);
  return it.hasNext() ? it.next() : null;
}

function extOf_(name) {
  var i = name.lastIndexOf('.');
  return i < 0 ? '' : name.substring(i).toLowerCase();
}

/** Classify a file so the UI can label and order it. ".env", ".env.production"
 *  and "tower.env" all count as config; .bin/.elf as the firmware image. */
function kindOf_(name) {
  var lower = name.toLowerCase();
  if (BINARY_EXTS.indexOf(extOf_(name)) !== -1) return 'binary';
  if (lower === '.env' || lower.indexOf('.env') === 0 || extOf_(name) === '.env') return 'env';
  return 'other';
}

function sha256Hex_(bytes) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  var out = '';
  for (var i = 0; i < d.length; i++) {
    var b = d[i] < 0 ? d[i] + 256 : d[i];
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

/** Everything in a tower's folder. Returns null when the folder is missing, so
 *  "unknown tower" reads differently from "folder is empty". */
function listTowerFiles_(id) {
  var folder = towerFolder_(id);
  if (!folder) return null;
  var out = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var name = f.getName();
    out.push({
      name: name,
      kind: kindOf_(name),
      size: f.getSize(),
      updated: f.getLastUpdated().toISOString(),
    });
  }
  return out;
}

/** One file's bytes, base64'd for transport. The caller (our Node server)
 *  decodes and streams it, so the browser never sees base64. */
function readTowerFile_(id, name) {
  var folder = towerFolder_(id);
  if (!folder) return null;
  var it = folder.getFilesByName(name);
  if (!it.hasNext()) return null;
  var bytes = it.next().getBlob().getBytes();
  return {
    name: name,
    size: bytes.length,
    sha256: sha256Hex_(bytes),
    b64: Utilities.base64Encode(bytes),
  };
}

/** Handle the two file actions. Returns null for anything else so the original
 *  provisioning doPost carries on as before. */
function handleFileActions_(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return null;
  }
  var action = body.action;
  if (action !== 'files' && action !== 'file') return null;

  // Fail closed: an unset SECRET refuses everything rather than allowing it.
  if (!SECRET || body.secret !== SECRET) return json_({ error: 'unauthorized' });

  var id = String(body.id || '').trim();
  if (!id) return json_({ error: 'missing tower id' });

  if (action === 'files') {
    var files = listTowerFiles_(id);
    if (files === null) return json_({ error: 'no Drive folder named "' + id + '"' });
    return json_({ id: id, files: files });
  }

  var name = String(body.name || '').trim();
  if (!name) return json_({ error: 'missing file name' });
  var file = readTowerFile_(id, name);
  if (!file) return json_({ error: 'no file "' + name + '" in "' + id + '"' });
  return json_(file);
}
