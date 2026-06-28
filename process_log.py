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
API_KEY     = os.environ.get("ANTHROPIC_API_KEY")
MODEL       = "claude-sonnet-4-6"             # sharper root-cause reasoning (~$2/mo)
MAX_TOKENS  = 10000

LOG_DIR     = r"D:\scheduler\logs"                          # where espflash writes the .log files
PROMPT_PATH = r"D:\scheduler\axum_nightly_analysis_prompt.md"
REPORTS_DIR = r"D:\scheduler\public\reports"                # source folder, served at /reports and NOT wiped by `npm run build`
INGEST_URL  = None     # not needed with the static-folder approach

RATIO_DEVIATION = 0.5   # flag a movement if |ratio - baseline| > 50% of baseline
STALL_GROW_MAX  = 3     # flag if Step Remaining grew more than this many times

# ------------------------------------------------------------------ regex ----
ANSI   = re.compile(r"\x1b\[[0-9;]*m")
HOSTTS = re.compile(r"^\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\.\d+\]")
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
        body = ANSI.sub("", re.sub(r"^\[[^\]]*\]\s?", "", l))
        rows.append((ts, body))
    return rows


def summarize_movements(rows):
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

    ratios = []
    for mv in moves:
        t = mv["ticks"]
        if len(t) >= 2 and (t[-1][1] - t[0][1]):
            ratios.append((t[-1][0]-t[0][0]) / (t[-1][1]-t[0][1]))
    base = statistics.median(ratios) if ratios else 0.0

    out = [f"MOVEMENT SUMMARY - {len(moves)} movements; "
           f"baseline encoder/step ratio = {base:.4f}"]
    flagged = 0
    for i, mv in enumerate(moves):
        t, oc = mv["ticks"], mv["outcome"]
        if len(t) < 2:
            out.append(f"  move {i}: outcome={oc} (no telemetry)")
            flagged += 1
            continue
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
        if flags:
            flagged += 1
            out.append(f"  move {i}: {mv['start_ts']} stepsD{sp} encD{en} "
                       f"ratio={ratio:.4f} samples={len(t)}  >> {', '.join(flags)}")
    out.append(f"  ({len(moves)-flagged} movements nominal and omitted; "
               f"{flagged} flagged above)")
    return "\n".join(out)


def collapse_events(rows):
    seq = [(ts, b) for ts, b in rows if not TICK.search(b) and b.strip()]
    norm = [UPTIME.sub(r"\1", b) for _, b in seq]
    out, i, n = [], 0, len(seq)
    while i < n:
        best_p, best_reps = 1, 1
        for p in range(1, 13):                 # try block lengths 1..12
            if i + 2*p > n:
                break
            reps = 1
            while (i + (reps+1)*p <= n and
                   norm[i+reps*p:i+(reps+1)*p] == norm[i:i+p]):
                reps += 1
            if reps >= 2 and reps*p > best_reps*best_p:
                best_p, best_reps = p, reps
        if best_reps >= 2:
            block = seq[i:i+best_p]
            last_ts = seq[i + best_reps*best_p - 1][0]
            out.append(f"[block x{best_reps}, {block[0][0]}-{last_ts}]")
            out.extend(f"    {b}" for _, b in block)
            i += best_reps * best_p
        else:
            ts, b = seq[i]
            out.append(f"[{ts}] {b}")
            i += 1
    return "\n".join(out)


def build_digest(path):
    rows = decode(path)
    digest = (summarize_movements(rows)
              + "\n\n=== EVENT LOG (repeating blocks collapsed) ===\n"
              + collapse_events(rows))
    return rows, digest


def load_prompt_with_trend():
    prompt = pathlib.Path(PROMPT_PATH).read_text(encoding="utf-8")
    prev = sorted(glob.glob(os.path.join(REPORTS_DIR, "axum_report_*.md")))
    if prev:
        prompt = prompt.replace(
            "(none)", pathlib.Path(prev[-1]).read_text(encoding="utf-8"), 1)
    return prompt


def call_claude(prompt, digest):
    if not API_KEY:
        sys.exit("ANTHROPIC_API_KEY is not set.")
    body = {
        "model": MODEL, "max_tokens": MAX_TOKENS,
        "messages": [{"role": "user",
                      "content": f"{prompt}\n\n### TODAY'S LOG (digest)\n\n{digest}"}],
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


def deliver(report_md, log_path):
    date = report_date_from_log(log_path)
    os.makedirs(REPORTS_DIR, exist_ok=True)
    out = os.path.join(REPORTS_DIR, f"axum_report_{date}.md")
    pathlib.Path(out).write_text(report_md, encoding="utf-8")
    print("Wrote", out)

    # Rebuild the manifest the web app reads (/reports/index.json). Newest first.
    files = sorted(
        (os.path.basename(p) for p in glob.glob(os.path.join(REPORTS_DIR, "axum_report_*.md"))),
        reverse=True,
    )
    index = os.path.join(REPORTS_DIR, "index.json")
    pathlib.Path(index).write_text(json.dumps({"reports": files}, indent=2), encoding="utf-8")
    print(f"Updated manifest: {len(files)} report(s) in index.json")

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
    print(f"  {len(rows):,} raw lines -> digest ~{len(digest)//4:,} tokens "
          f"({digest.count(chr(10)):,} lines)")

    if "--digest-only" in sys.argv:
        print("\n" + digest)
        return

    report = call_claude(load_prompt_with_trend(), digest)
    deliver(report, log_path)


if __name__ == "__main__":
    main()