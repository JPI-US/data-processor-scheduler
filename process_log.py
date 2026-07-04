#!/usr/bin/env python3
"""
Axum nightly log processor (smart preprocessing edition).

What it does, in order:
  1. Decode the UTF-16 espflash log; strip ANSI codes; keep host timestamps.
  2. MOVEMENT SUMMARY - for every Relay ON..OFF cycle, compute step travel,
     encoder travel, and the encoder/step ratio. Establish the run's baseline
     ratio and flag ONLY movements that deviate, stall (Step Remaining grows),
     don't reach target, or end in a non-Completed outcome. Nominal movements
     are counted and omitted. This preserves encoder-drift / stall detection
     WITHOUT shipping every per-step telemetry line.
  3. EVENT LOG - keep all non-tick lines, but collapse repeating blocks
     (single- or multi-line) into one block tagged "[block xN, start-end]".
     A 243x DNS-failure storm becomes one counted block, not ~1,700 lines.
  4. Inject yesterday's report into the prompt for trend detection.
  5. Send prompt + compact digest to the Claude API; write the dated report.

The raw .log on disk is never modified - this only shapes what is SENT.
Standard library only. Set ANTHROPIC_API_KEY in the environment.

Usage:
  python process_log.py path\\to\\today.log
  python process_log.py                       # newest *.log in LOG_DIR
  python process_log.py today.log --digest-only   # inspect preprocessing, no API call
"""

import io
import os
import re
import sys
import glob
import json
import time
import pathlib
import datetime
import statistics
import urllib.request
import urllib.error

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")


def _load_dotenv(path=".env"):
    try:
        for line in pathlib.Path(path).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val
    except FileNotFoundError:
        pass

_load_dotenv(os.path.join(os.path.dirname(__file__) or ".", ".env"))

# ------------------------------------------------------------------ config ---
# All env-overridable so the same script runs on this PC and (later) a server,
# and so caps can be tuned to the API tier without code changes.
API_KEY     = os.environ.get("ANTHROPIC_API_KEY")
MODEL       = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
MAX_TOKENS  = int(os.environ.get("MAX_OUTPUT_TOKENS", "4000"))   # output cap (fits 4K/min tier)
# Safety net only - smart preprocessing already gets digests well under this.
# If a digest still exceeds the cap, it's truncated (head + tail kept).
MAX_DIGEST_TOKENS = int(os.environ.get("MAX_DIGEST_TOKENS", "8000"))

LOG_DIR     = os.environ.get("AXUM_LOG_DIR", r"D:\scheduler\logs")
PROMPT_PATH = os.environ.get("AXUM_PROMPT_PATH", r"D:\scheduler\axum_nightly_analysis_prompt.md")
REPORTS_DIR = os.environ.get("AXUM_REPORTS_DIR", r"D:\scheduler\public\reports")
INGEST_URL  = None     # not needed with the static-folder approach

RATIO_DEVIATION = 0.5   # flag a movement if |ratio - baseline| > 50% of baseline
STALL_GROW_MAX  = 3     # flag if Step Remaining grew more than this many times

# ------------------------------------------------------------------ regex ----
ANSI   = re.compile(r"\x1b\[[0-9;]*m")
# Host timestamp prefix, tolerant of both capture formats:
#   run_capture.py     -> "[2026-06-28 17:20:48.332] body"   (bracketed)
#   capture_and_run.ps1 -> "2026-06-28 17:20:48.332 body"    (unbracketed)
HOSTTS = re.compile(r"^\[?(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\.\d+\]?\s?")
TICK   = re.compile(r"Encoder Ticks:\s*(-?\d+),\s*Step Position:\s*(-?\d+),\s*Step Remaining:\s*(-?\d+)")
UPTIME = re.compile(r"^([IWEDV]) \(\d+\)")     # normalize the (uptime_ms) counter for dedup
ON     = "Relay ON - Starting motor movement"
OFF    = re.compile(r"Relay OFF - Motor movement finished(?:\s*\(ticks\))?: (\w+)")


def decode(path):
    raw = pathlib.Path(path).read_bytes().decode("utf-16", errors="replace").splitlines()
    rows = []
    for l in raw:
        m = HOSTTS.match(l)
        ts = m.group(1) if m else None
        rest = l[m.end():] if m else l
        body = ANSI.sub("", rest)
        rows.append((ts, body))
    return rows


def _build_moves(rows):
    """Pair each Relay ON..OFF cycle into a move with its tick telemetry."""
    moves, cur = [], None
    for ts, b in rows:
        if ON in b:
            cur = {"start_ts": ts, "ticks": [], "outcome": None}
        m = TICK.search(b)
        if m and cur is not None:
            cur["ticks"].append(tuple(int(x) for x in m.groups()))
        mo = OFF.search(b)
        if mo and cur is not None:
            cur["outcome"] = mo.group(1)
            moves.append(cur); cur = None
    return moves


def _baseline_ratio(moves):
    ratios = []
    for mv in moves:
        t = mv["ticks"]
        if len(t) >= 2 and (t[-1][1] - t[0][1]):
            ratios.append((t[-1][0]-t[0][0]) / (t[-1][1]-t[0][1]))
    return statistics.median(ratios) if ratios else 0.0


def _move_flags(mv, base):
    """Return the list of anomaly flags for one move (empty == nominal)."""
    t, oc = mv["ticks"], mv["outcome"]
    if len(t) < 2:
        return [f"OUTCOME={oc}(no telemetry)"]
    sp = t[-1][1] - t[0][1]
    en = t[-1][0] - t[0][0]
    ratio = en/sp if sp else 0.0
    srs = [abs(x[2]) for x in t]
    grew = sum(1 for a, b in zip(srs, srs[1:]) if b > a)
    reached = srs[-1] < 0.02 * max(srs) if srs else False
    flags = []
    if oc != "Completed":
        flags.append(f"OUTCOME={oc}")
    if base and abs(ratio - base) > RATIO_DEVIATION * abs(base):
        flags.append(f"RATIO_DEVIATION(this={ratio:.4f} vs base={base:.4f})")
    if grew > STALL_GROW_MAX:
        flags.append(f"REMAINING_GREW_{grew}x(possible stall)")
    if oc == "Completed" and not reached:
        flags.append("DIDNT_REACH_TARGET")
    return flags


def summarize_movements(rows):
    moves = _build_moves(rows)
    base = _baseline_ratio(moves)
    out = [f"MOVEMENT SUMMARY - {len(moves)} movements; "
           f"baseline encoder/step ratio = {base:.4f}"]
    flagged = 0
    for i, mv in enumerate(moves):
        flags = _move_flags(mv, base)
        if not flags:
            continue
        flagged += 1
        t = mv["ticks"]
        if len(t) < 2:
            out.append(f"  move {i}: {mv['start_ts']}  >> {', '.join(flags)}")
        else:
            sp = t[-1][1] - t[0][1]
            en = t[-1][0] - t[0][0]
            ratio = en/sp if sp else 0.0
            out.append(f"  move {i}: {mv['start_ts']} stepsD{sp} encD{en} "
                       f"ratio={ratio:.4f} samples={len(t)}  >> {', '.join(flags)}")
    out.append(f"  ({len(moves)-flagged} movements nominal and omitted; "
               f"{flagged} flagged above)")
    return "\n".join(out)


def classify_and_rollup(rows):
    """Classify each non-tick, non-movement line and collapse repeating noise to
    a per-category summary, keeping meaningful + novel events verbatim.

    This is what keeps a full continuous day small: a quiet good day is mostly
    sun-tracking telemetry (TRACKING_CYCLE), a bad day is mostly the MQTT/DNS
    cascade (MQTT_CONN_FAIL/DNS_FAIL) - both collapse to one line each. Unknown
    lines that repeat a lot collapse by normalized form; rare ones stay verbatim
    so a novel issue is never hidden."""
    import signatures as sig
    UNKNOWN_ROLLUP_MIN = 4   # an unknown pattern repeating >= this = noise

    # pass 1: classify + count rollup keys
    items, counts = [], {}
    for ts, b in rows:
        if not b.strip() or TICK.search(b) or ON in b or OFF.search(b):
            continue
        cat, mode = sig.classify(b)
        if mode == sig.EVENT:
            key = None
        elif mode == sig.ROLLUP:
            key = cat
        else:                                   # unknown -> key by normalized form
            key = "~" + sig.normalize(b)
        items.append((ts, b, cat, mode, key))
        if key is not None:
            counts[key] = counts.get(key, 0) + 1

    # pass 2: build rollups + a chronological event log
    rollups, order, events = {}, [], []
    for ts, b, cat, mode, key in items:
        roll = (mode == sig.ROLLUP) or (mode is None and counts.get(key, 0) >= UNKNOWN_ROLLUP_MIN)
        if not roll:
            tag = f"[{cat}] " if cat else ""
            events.append(f"[{ts}] {tag}{b}")
            continue
        r = rollups.get(key)
        if r is None:
            rollups[key] = [1, ts, ts, (cat or "noise"), sig.message(b)]
            order.append(key)
        else:
            r[0] += 1
            r[2] = ts

    out = ["=== ACTIVITY ROLLUP (repeating lines collapsed: count, window, example) ==="]
    for key in sorted(order, key=lambda k: -rollups[k][0]):
        n, t0, t1, label, ex = rollups[key]
        win = f"{t0} - {t1}" if t0 != t1 else f"{t0}"
        out.append(f"  {label:<16} {n:>6}x  {win}  e.g. \"{ex[:80]}\"")
    out.append("")
    out.append("=== EVENT LOG (meaningful + novel lines, chronological) ===")
    out.extend(events)
    return "\n".join(out)


# ----------------------------------------------------------- metrics block ---
# Phase 0 contract: process_log.py computes the hard numbers deterministically
# from the log; the UI trends THESE, never the model's prose. Emitted as an
# HTML comment at the top of each report (invisible when rendered as markdown).
METRICS_SCHEMA = 1
TS_FMT = "%Y-%m-%d %H:%M:%S"

FW_RE   = re.compile(r"App version:\s*(\S+)")
MODE_RE = re.compile(r'Motion mode:\s*"([^"]+)"')


def _parse_ts(ts):
    try:
        return datetime.datetime.strptime(ts, TS_FMT) if ts else None
    except ValueError:
        return None


def _crash_kind(reason):
    if "ESP_ERR_TIMEOUT" in reason:
        return "ESP_ERR_TIMEOUT"
    reason = reason.strip()
    return reason[:48] if reason else "panic"


def compute_metrics(rows, log_path, report_date=None):
    """Deterministic per-session metrics, counted from the decoded log."""
    dts = [d for d in (_parse_ts(ts) for ts, _ in rows if ts) if d]
    session_min = round((dts[-1] - dts[0]).total_seconds() / 60) if len(dts) >= 2 else 0
    last_dt = dts[-1] if dts else None

    boots = dns = publishes = wifi_reconnect_fail = 0
    crashes = 0
    crash_kinds = []
    firmware = encoder_mode = None
    nvs_ok = True
    expect_reason = False

    mqtt_state, mqtt_connect_dt, mqtt_connected_s = "down", None, 0.0
    mqtt_connects = mqtt_disconnects = 0

    sleep_phase = False
    startup_attempt = sleep_attempt = False
    homing_startup_ok = homing_sleep_ok = None

    for ts, b in rows:
        dt = _parse_ts(ts)

        if firmware is None:
            mfw = FW_RE.search(b)
            if mfw:
                firmware = mfw.group(1)
        mmode = MODE_RE.search(b)
        if mmode:
            encoder_mode = mmode.group(1)
        if "switching to StepperOnly" in b:
            encoder_mode = "StepperOnly"

        if "Calling app_main()" in b:
            boots += 1

        # crashes: a panic's reason is on the following non-empty line
        if expect_reason and b.strip():
            kind = _crash_kind(b)
            if kind not in crash_kinds and len(crash_kinds) < 5:
                crash_kinds.append(kind)
            expect_reason = False
        if "panicked at" in b:
            crashes += 1
            expect_reason = True
        elif "Guru Meditation" in b:
            crashes += 1
            if "Guru Meditation" not in crash_kinds and len(crash_kinds) < 5:
                crash_kinds.append("Guru Meditation")
        elif "Task watchdog got triggered" in b:
            crashes += 1
            if "task watchdog" not in crash_kinds and len(crash_kinds) < 5:
                crash_kinds.append("task watchdog")

        if "Wi-Fi reconnect: connect() failed" in b:
            wifi_reconnect_fail += 1

        # connectivity
        if "getaddrinfo() returns" in b:
            dns += 1
        if "published successfully" in b:
            publishes += 1
        if "MQTT Connected" in b:
            if mqtt_state == "down":
                mqtt_connects += 1
                mqtt_state, mqtt_connect_dt = "up", dt
        elif "MQTT Disconnected" in b:
            if mqtt_state == "up":
                mqtt_disconnects += 1
                if mqtt_connect_dt and dt:
                    mqtt_connected_s += (dt - mqtt_connect_dt).total_seconds()
                mqtt_state, mqtt_connect_dt = "down", None

        # persistence
        if re.search(r"nvs.*(error|fail|invalid|disabled)", b, re.I) and "enabled" not in b:
            nvs_ok = False

        # homing — split into startup vs sleep phase
        if "Moving to sleep position" in b:
            sleep_phase = True
        attempt = "Looking for the limit switch" in b
        success = ("Homing OK" in b) or ("found home" in b)
        if not sleep_phase:
            startup_attempt = startup_attempt or attempt
            if success:
                homing_startup_ok = True
        else:
            sleep_attempt = sleep_attempt or attempt
            if success:
                homing_sleep_ok = True

    if mqtt_state == "up" and mqtt_connect_dt and last_dt:
        mqtt_connected_s += (last_dt - mqtt_connect_dt).total_seconds()
    if startup_attempt and homing_startup_ok is None:
        homing_startup_ok = False
    if sleep_attempt and homing_sleep_ok is None:
        homing_sleep_ok = False

    moves = _build_moves(rows)
    base = _baseline_ratio(moves)
    started = sum(1 for _, b in rows if ON in b)
    completed = sum(1 for mv in moves if mv["outcome"] == "Completed")
    flagged = sum(1 for mv in moves if _move_flags(mv, base))

    hours = session_min / 60 if session_min else 0

    # null guards (the locked contract): only emit a rate when it's meaningful.
    motion_pct = round(100 * completed / started, 1) if started >= 5 else None
    uptime_pct = (round(100 * mqtt_connected_s / (session_min * 60), 1)
                  if session_min >= 30 and mqtt_connects >= 1 else None)
    dns_per_hr = round(dns / hours, 1) if session_min >= 15 and hours else None

    return {
        "schema": METRICS_SCHEMA,
        "session_date": report_date or derive_report_date(rows, log_path),
        "firmware": firmware,
        "session_minutes": session_min,
        "boots": boots,
        "crashes": crashes,
        "crash_kinds": crash_kinds,
        "wifi_reconnect_failures": wifi_reconnect_fail,
        "movements_started": started,
        "movements_completed": completed,
        "motion_completion_pct": motion_pct,
        "flagged_movements": flagged,
        "mqtt_connects": mqtt_connects,
        "mqtt_disconnects": mqtt_disconnects,
        "mqtt_uptime_pct": uptime_pct,
        "dns_failures": dns,
        "dns_failures_per_hour": dns_per_hr,
        "mqtt_publishes_confirmed": publishes,
        "encoder_mode": encoder_mode,
        "nvs_ok": nvs_ok,
        "homing_startup_ok": homing_startup_ok,
        "homing_sleep_ok": homing_sleep_ok,
    }


def metrics_block(metrics):
    return f"<!--axum-metrics\n{json.dumps(metrics, indent=2)}\n-->"


def _strip_to_report(md):
    """Discard any preamble the model emits before the report proper.

    The prompt forbids pre-analysis notes, but a model will occasionally 'think
    out loud' ('I'll analyze...', 'Key observations:') before the title - which
    pushes the title and verdict past where the web parser looks, yielding an
    'Untitled Report' with no verdict (as on 2026-07-03). The report proper
    starts at its H1 title, so keep from there. Fall back to the VERDICT line,
    then the whole text, so we never drop a report that simply lacks an H1."""
    m = re.search(r"^#[^#].*$", md, re.M)          # first level-1 heading = title
    if m:
        return md[m.start():].lstrip()
    m = re.search(r"^##\s*VERDICT:", md, re.M)      # fallback: the verdict line
    if m:
        return md[m.start():].lstrip()
    return md.lstrip()


def _cap_digest(digest):
    """Last-resort safety net: if smart preprocessing still leaves a digest over
    the cap, keep the head + tail (boot/setup + end-of-day/crash) with a marker."""
    budget = MAX_DIGEST_TOKENS * 4   # ~4 chars per token
    if len(digest) <= budget:
        return digest
    head = digest[: int(budget * 0.6)]
    tail = digest[-int(budget * 0.35):]
    return (head + f"\n\n[... digest truncated to ~{MAX_DIGEST_TOKENS} tokens "
            f"(smart preprocessing left it large) ...]\n\n" + tail)


def build_digest(path):
    rows = decode(path)
    digest = (summarize_movements(rows)
              + "\n\n"
              + classify_and_rollup(rows))
    return rows, _cap_digest(digest)


def _trend_context(prev_path):
    """For trend context, inject only the previous report's metrics block +
    verdict line (~0.4K tokens) instead of the whole report (~3K) - smaller and
    cleaner, since trends key off the deterministic numbers anyway."""
    txt = pathlib.Path(prev_path).read_text(encoding="utf-8")
    parts = []
    m = re.search(r"<!--axum-metrics\s*(.*?)-->", txt, re.S)
    if m:
        parts.append("Previous session metrics:\n" + m.group(1).strip())
    v = re.search(r"^##\s*VERDICT:.*$", txt, re.M)
    if v:
        parts.append(v.group(0).strip())
    return "\n\n".join(parts) if parts else txt


def load_prompt_with_trend():
    prompt = pathlib.Path(PROMPT_PATH).read_text(encoding="utf-8")
    prev = sorted(glob.glob(os.path.join(REPORTS_DIR, "axum_report_*.md")))
    if prev:
        prompt = prompt.replace("(none)", _trend_context(prev[-1]), 1)
    return prompt


def call_claude(prompt, digest, metrics):
    if not API_KEY:
        sys.exit("ANTHROPIC_API_KEY is not set.")
    ground_truth = (
        "### GROUND-TRUTH METRICS (authoritative, computed from the log — use these "
        "exact numbers; do not recompute, contradict, or reproduce as a table)\n\n"
        f"{json.dumps(metrics, indent=2)}"
    )
    content = f"{prompt}\n\n{ground_truth}\n\n### TODAY'S LOG (digest)\n\n{digest}"
    body = {
        "model": MODEL, "max_tokens": MAX_TOKENS,
        "messages": [{"role": "user", "content": content}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode("utf-8"),
        headers={"content-type": "application/json", "x-api-key": API_KEY,
                 "anthropic-version": "2023-06-01"})
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        sys.exit(f"API error {e.code}: {e.read().decode('utf-8','replace')}")
    return "".join(b["text"] for b in data["content"] if b.get("type") == "text")


def report_date_from_log(log_path):
    """Derive the report date from the log filename's YYYYMMDD stamp
    (e.g. esp32-monitor-20260626-162323.log -> 2026-06-26). Fall back to
    today if the filename has no recognizable date."""
    base = os.path.basename(log_path)
    m = re.search(r"(\d{4})(\d{2})(\d{2})", base)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return datetime.date.today().isoformat()


def derive_report_date(rows, log_path):
    """Date the report by the day the log's data PREDOMINANTLY covers, using the
    host timestamps inside the log. This is robust to filenames that reflect the
    capture-start time rather than the day captured - e.g. a file started at
    23:09 on the 28th but covering all of the 29th must report as the 29th, not
    overwrite the 28th. Falls back to the filename stamp, then today."""
    counts = {}
    for ts, _ in rows:
        dt = _parse_ts(ts)
        if dt:
            d = dt.date().isoformat()
            counts[d] = counts.get(d, 0) + 1
    if counts:
        return max(counts, key=counts.get)
    return report_date_from_log(log_path)


def _atomic_write(path, text, retries=6, delay=0.25):
    """Write via a temp file + atomic rename so a reader (incl. the web app over
    a LAN mount) never sees a half-written file.

    On Windows/SMB, os.replace() over a destination another process has *open*
    (a reader polling index.json, JantaServer over CIFS) raises PermissionError.
    That's transient - readers hold the handle for milliseconds - so we retry a
    few times before giving up rather than failing the whole delivery."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    for attempt in range(retries):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            if attempt == retries - 1:
                raise
            time.sleep(delay)


SUPERSEDED_DIR = os.path.join(REPORTS_DIR, "superseded")
RUN_LOG = os.path.join(REPORTS_DIR, "run-log.jsonl")
_VERDICT_RE = re.compile(r"^##\s*VERDICT:\s*(PASS|WARN|FAIL)\b", re.M | re.I)


def validate_report(report_md):
    """Return the verdict (PASS/WARN/FAIL) if the report is well-formed, else None.

    'Well-formed' means it carries BOTH contracts the rest of the system relies
    on: the deterministic metrics block (the UI trends off it) and a machine-
    readable verdict line (retention keys off it). Anything missing those is a
    half-formed/brittle report we must not publish."""
    if "<!--axum-metrics" not in report_md:
        return None
    m = _VERDICT_RE.search(report_md)
    return m.group(1).upper() if m else None


def _append_run_log(date, log_path, verdict, superseded, digest_tokens):
    """Append one JSON line per run - a durable audit trail answering 'what was
    written, from which raw slice, with what verdict, and did it replace a prior
    report?'. This is what makes report history reviewable rather than opaque."""
    entry = {
        "at": datetime.datetime.now().isoformat(timespec="seconds"),
        "date": date,
        "verdict": verdict,
        "source_log": os.path.basename(log_path),
        "model": MODEL,
        "digest_tokens": digest_tokens,
        "superseded": os.path.basename(superseded) if superseded else None,
    }
    try:
        with open(RUN_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except OSError as e:
        print("Warning: could not append run-log:", e)


def deliver(report_md, log_path, date=None, digest_tokens=None):
    if date is None:
        date = report_date_from_log(log_path)
    os.makedirs(REPORTS_DIR, exist_ok=True)

    out = os.path.join(REPORTS_DIR, f"axum_report_{date}.md")

    # No-clobber: never destroy an existing report for this date. If one already
    # exists, move it into superseded/ with a timestamp BEFORE writing the new
    # one. So a re-run (a manual reprocess, or a partial daytime report replaced
    # by the full 23:00 rollover) updates the current report without ever losing
    # history - and every replacement is auditable, not silent.
    superseded = None
    if os.path.exists(out):
        os.makedirs(SUPERSEDED_DIR, exist_ok=True)
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        superseded = os.path.join(SUPERSEDED_DIR, f"axum_report_{date}__{stamp}.md")
        os.replace(out, superseded)
        print(f"Superseded prior report -> superseded/{os.path.basename(superseded)}")

    # Write the report FIRST (atomically), then the manifest LAST, so the web app
    # never sees index.json list a report whose file isn't fully there yet.
    _atomic_write(out, report_md)
    print("Wrote", out)

    # Refresh index.json as a convenience artifact. This is now BEST-EFFORT: the
    # web server derives the report list from the directory on each request
    # (see server.mjs), so a failed manifest write can no longer hide a report
    # from the UI - and must never crash delivery (which would skip the run-log
    # and strand the raw slice, as happened on the 2026-07-02 rollover).
    files = sorted(
        (os.path.basename(p) for p in glob.glob(os.path.join(REPORTS_DIR, "axum_report_*.md"))),
        reverse=True,
    )
    try:
        _atomic_write(os.path.join(REPORTS_DIR, "index.json"),
                      json.dumps({"reports": files}, indent=2))
        print(f"Updated manifest: {len(files)} report(s) in index.json")
    except OSError as e:
        print(f"Warning: index.json update failed ({e}); the web server derives "
              f"the list from the directory, so the report is still visible.")

    _append_run_log(date, log_path, validate_report(report_md), superseded, digest_tokens)

    if INGEST_URL:
        try:
            urllib.request.urlopen(urllib.request.Request(
                INGEST_URL,
                data=json.dumps({"fileName": f"axum_report_{date}.md",
                                 "source": report_md}).encode("utf-8"),
                headers={"content-type": "application/json"}), timeout=30)
            print("Posted to UI:", INGEST_URL)
        except Exception as e:
            print("Warning: could not POST to UI:", e)


def main():
    if len(sys.argv) > 1 and not sys.argv[1].startswith("--"):
        log_path = sys.argv[1]
    else:
        files = sorted(glob.glob(os.path.join(LOG_DIR, "*.log")))
        if not files:
            sys.exit(f"No .log files in {LOG_DIR}")
        log_path = files[-1]

    print("Processing", log_path)
    rows, digest = build_digest(log_path)
    report_date = derive_report_date(rows, log_path)
    metrics = compute_metrics(rows, log_path, report_date)
    print(f"  {len(rows):,} raw lines -> digest ~{len(digest)//4:,} tokens "
          f"({digest.count(chr(10)):,} lines) -> report date {report_date}")

    if "--digest-only" in sys.argv:
        print("\n" + metrics_block(metrics))
        print("\n" + digest)
        return

    raw = call_claude(load_prompt_with_trend(), digest, metrics)
    # Strip any preamble the model emitted before the report proper, then prepend
    # the deterministic metrics block so the UI trends exact numbers, not the
    # model's prose. parse.ts strips the metrics block before rendering.
    report = metrics_block(metrics) + "\n\n" + _strip_to_report(raw)

    # Integrity gate: refuse to publish a half-formed report. If the model output
    # has no machine-readable verdict, exiting non-zero here makes
    # report_and_retain KEEP the raw slice (its non-zero-exit path) so the day can
    # be re-run cleanly - far better than shipping a report the UI and retention
    # can't parse. The metrics block we prepended is always present; the verdict
    # is the model's contribution and the thing worth guarding.
    verdict = validate_report(report)
    if not verdict:
        sys.exit("Refusing to write report: model output has no "
                 "'## VERDICT: PASS/WARN/FAIL' line. Raw log kept; re-run later.")

    deliver(report, log_path, report_date, digest_tokens=len(digest) // 4)
    print(f"Verdict: {verdict}")


if __name__ == "__main__":
    main()