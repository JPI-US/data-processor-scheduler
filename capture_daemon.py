#!/usr/bin/env python3
r"""
capture_daemon.py - continuous Axum capture with automatic 11 PM daily rollover.

Replaces the old stop/restart capture that forced a manual Ctrl+R EVERY day.
Start this ONCE, press Ctrl+R ONCE when prompted, then leave it running forever.

What it does:
  - Runs `espflash monitor` continuously and timestamps every line into a dated
    file  logs\capture-<YYYYMMDD>.log  (UTF-16 LE + BOM, same as before).
  - At 23:00 each day it ROLLS OVER WITHOUT restarting espflash (so no Ctrl+R):
    closes the day's file, opens the next day's file, and launches report
    generation on the just-closed file in the background (process_log.py).
  - One Ctrl+R ever. Ctrl+C stops the daemon cleanly.

The file is dated by the date of its *next* 23:00 rollover - i.e. the solar day
it predominantly covers - so process_log.py names the report correctly.

Daily routine becomes: nothing. It self-slices and self-reports at 11 PM.

Usage:
  python capture_daemon.py
"""

import os
import sys
import json
import datetime
import subprocess

# ----------------------------------------------------------------- config ----
# Env-overridable so the same script works on the Monitor PC and (later) points
# at a LAN-shared folder, and so it can be dry-run-tested without the device.
PORT            = os.environ.get("AXUM_PORT", "COM11")
LOG_DIR         = os.environ.get("AXUM_LOG_DIR", r"D:\scheduler\logs")
PROCESSOR       = os.environ.get("AXUM_PROCESSOR", r"D:\scheduler\process_log.py")
PYTHON          = sys.executable          # same interpreter running this script
ROLLOVER_HOUR   = 23                       # 11 PM local
MIN_SLICE_LINES = 50                       # skip report if a slice is this short

# Test hooks (unset in production):
#   AXUM_TEST_ROLL_SECS - roll every N seconds instead of at 23:00
#   AXUM_CAPTURE_CMD    - JSON list to run instead of espflash (a fake emitter)
_TEST_ROLL_SECS = os.environ.get("AXUM_TEST_ROLL_SECS")
_CAPTURE_CMD    = os.environ.get("AXUM_CAPTURE_CMD")


def capture_cmd():
    if _CAPTURE_CMD:
        return json.loads(_CAPTURE_CMD)
    return ["espflash", "monitor", "--port", PORT]


def next_rollover(now):
    """The next 23:00 boundary at or after `now` (or +N s under the test hook)."""
    if _TEST_ROLL_SECS:
        return now + datetime.timedelta(seconds=float(_TEST_ROLL_SECS))
    today_23 = now.replace(hour=ROLLOVER_HOUR, minute=0, second=0, microsecond=0)
    return today_23 if now < today_23 else today_23 + datetime.timedelta(days=1)


def slice_path(rollover_dt):
    return os.path.join(LOG_DIR, f"capture-{rollover_dt:%Y%m%d}.log")


def open_slice(path):
    """Append-safe UTF-16 LE open; write a BOM only when the file is new."""
    new = (not os.path.exists(path)) or os.path.getsize(path) == 0
    f = open(path, "a", encoding="utf-16-le")
    if new:
        f.write("﻿")  # BOM, so process_log.py's decode("utf-16") picks LE
    return f


def kick_report(path, lines):
    """Launch report generation on a closed slice, detached (non-blocking)."""
    name = os.path.basename(path)
    if lines < MIN_SLICE_LINES:
        print(f"[daemon] {name}: only {lines} lines - skipping report (too short).")
        return
    print(f"[daemon] {name}: generating report in the background ...")
    flags = subprocess.CREATE_NEW_CONSOLE if os.name == "nt" else 0
    subprocess.Popen([PYTHON, PROCESSOR, path], creationflags=flags)


def main():
    os.makedirs(LOG_DIR, exist_ok=True)
    now = datetime.datetime.now()
    roll = next_rollover(now)
    path = slice_path(roll)
    f = open_slice(path)
    lines = 0

    print("=" * 66)
    print("  AXUM CONTINUOUS CAPTURE")
    print("  >> Press CTRL+R ONCE now to start the device streaming.")
    print("  >> Then leave this running - it auto-slices + reports at 11 PM daily.")
    print("  >> CTRL+C to stop.")
    print(f"  Logging to    : {path}")
    print(f"  Next rollover : {roll:%Y-%m-%d %H:%M}")
    print("=" * 66)

    proc = subprocess.Popen(
        capture_cmd(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        stdin=None,                 # inherit console stdin so CTRL+R reaches espflash
        text=True,
        bufsize=1,
        encoding="utf-8",
        errors="replace",
    )
    try:
        for line in proc.stdout:
            line = line.rstrip("\n")
            ts = datetime.datetime.now()

            # Rollover BEFORE writing, so this line lands in the new day's file.
            if ts >= roll:
                f.close()
                closed_path, closed_lines = path, lines
                roll = next_rollover(ts)
                path = slice_path(roll)
                f = open_slice(path)
                lines = 0
                print(f"[daemon] rolled over -> {os.path.basename(path)} "
                      f"(next {roll:%m-%d %H:%M})")
                kick_report(closed_path, closed_lines)

            stamp = ts.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            f.write(f"[{stamp}] {line}\n")
            f.flush()
            lines += 1
    except KeyboardInterrupt:
        print("\n[daemon] CTRL+C - stopping capture.")
    finally:
        try:
            f.close()
        except Exception:
            pass
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        print("[daemon] stopped.")


if __name__ == "__main__":
    main()
