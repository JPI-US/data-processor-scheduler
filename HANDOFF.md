# Handoff: Tower Firmware Dispenser (Google Apps Script)

## Goal
A Google Apps Script web app for a fleet of tracking towers. An on-site tech opens
one URL, types a device ID (or picks it from a fleet list), and downloads that
tower's **firmware binary** and its **`.env`** — with no Google login or Drive
access on their end. The same Apps Script project also exposes a provisioning
endpoint that find-or-creates a Drive folder per tower.

## Starting point
Two files are attached and already working — build on them, don't restart:
- `Code.gs` — backend (`doGet`, `doPost`, `listFleet`, `getTowerFiles` + helpers).
- `Index.html` — the served page (device ID input + a top-right "Fleet" drawer that
  lists folders and loads one on click; files arrive base64-encoded and are turned
  into blob downloads client-side).

## Key decisions already made (don't re-open these)
- **Apps Script, not a static site.** A plain HTML page can't authenticate to Drive
  or serve files. Apps Script runs as the deploying owner, so the tech needs nothing.
- **Download-only, no flashing.** Flashing to the ESP was dropped: a browser can't
  reach a USB/serial port. If bench flashing is wanted later, it belongs in a
  separate local script (espflash), not this web app.
- **One project does three jobs:** `doGet` serves the page, `doPost` provisions
  folders (unchanged from the user's original), `getTowerFiles` dispenses files.
- **Folder lookup is by exact name.** The provisioner names each folder by the raw
  `id` it's posted, so `getTowerFiles` matches the folder name exactly (no "Tower N"
  prefix assumption).

## Data model / assumptions
- `PARENT_ID` is the fleet folder. It contains one subfolder per tower.
- Each tower folder is named by the device id and holds exactly one firmware binary
  (`.bin` or `.elf`) and one `.env`. A separate program populates these folders.

## Config (top of `Code.gs`)
- `PARENT_ID` — fleet folder id (already set to the user's folder).
- `SECRET` — shared secret for the `doPost` provisioning endpoint. **Currently empty**,
  which means anyone who knows the URL can create folders. Set this.
- `BINARY_EXTS` — extensions treated as the binary (`.bin`, `.elf`).

## Deploy
1. New project at script.google.com.
2. Paste `Code.gs`. Add an HTML file named exactly `Index` and paste `Index.html`.
3. Set `PARENT_ID` and `SECRET`.
4. Deploy > New deployment > Web app: **Execute as: me**, **Who has access:**
   choose per the security note below.

## Remaining work
1. **Confirm folder naming** matches the device ID techs actually use. If it doesn't,
   fix the naming in the provisioner or the lookup in `getTowerFiles`.
2. **Set `SECRET`** and confirm the provisioner rejects requests without it.
3. **Choose access scope.** The `.env` contains the WiFi password, so serving it via
   a fully public web app exposes that secret to anyone with the URL. Prefer
   "Anyone within <org>". Flag to the user if public access is a hard requirement.
4. **Large-binary fallback.** `getTowerFiles` returns file bytes as base64 through
   `google.script.run`, which has a transfer size ceiling. ESP firmware is normally
   well under it, but if a large binary ever fails to download, switch that path to
   return a direct Drive download link (`https://drive.google.com/uc?export=download&id=FILE_ID`)
   instead of the bytes. Note this needs the file readable by the downloader.
5. **Edge cases** in `pickBinary` / `pickEnv`: a folder with zero or multiple binaries
   or env files currently picks the first / errors generically. Decide desired behavior.

## Nice-to-haves (optional, confirm with user before adding)
- Show file size and last-modified next to each fleet entry.
- An "open in Drive" link per tower.
- A single "download both" affordance / progress indicator.

## Possibly out of scope now
The project began as a **`.env` generator** (type lat/long, ESP board, limit switch,
slew bearing → produce an `.env` from `.env.example`). The design evolved into
dispensing pre-made files from Drive instead. Confirm with the user whether the
generator is still wanted as a separate tool or has been superseded.

## Acceptance criteria
- Typing a known device ID downloads both the binary and the `.env`.
- Picking a tower from the sidebar does the same.
- An unknown ID, or a folder missing a file, shows a clear error (no silent failure).
- The `doPost` provisioning endpoint still find-or-creates folders and rejects bad secrets.
