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
import threading
import subprocess

# ----------------------------------------------------------------- config ----
# Env-overridable so the same script works on the Monitor PC and (later) points
# at a LAN-shared folder, and so it can be dry-run-tested without the device.
PORT            = os.environ.get("AXUM_PORT", "COM11")
LOG_DIR         = os.environ.get("AXUM_LOG_DIR", r"D:\scheduler\logs")
# The daemon hands each closed slice to report_and_retain.py (report + digest +
# verdict-based retention). Override AXUM_REPORTER to point elsewhere / for tests.
REPORTER        = os.environ.get("AXUM_REPORTER", r"D:\scheduler\report_and_retain.py")
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
    """Hand a closed slice to report_and_retain.py, detached (non-blocking)."""
    name = os.path.basename(path)
    if lines < MIN_SLICE_LINES:
        print(f"[daemon] {name}: only {lines} lines - skipping report (too short).")
        return
    print(f"[daemon] {name}: report + retention in the background ...")
    flags = subprocess.CREATE_NEW_CONSOLE if os.name == "nt" else 0
    subprocess.Popen([PYTHON, REPORTER, path], creationflags=flags)


def main():
    os.makedirs(LOG_DIR, exist_ok=True)
    # Shared state guarded by `lock`: both the capture loop and the timer thread
    # touch the file handle + rollover boundary, so all access is serialized.
    st = {"roll": next_rollover(datetime.datetime.now())}
    st["path"] = slice_path(st["roll"])
    st["f"] = open_slice(st["path"])
    st["lines"] = 0
    lock = threading.Lock()
    stop = threading.Event()

    def do_rollover(ts):
        """Caller holds lock: close the day's slice, open the next, fire report."""
        st["f"].close()
        closed_path, closed_lines = st["path"], st["lines"]
        st["roll"] = next_rollover(ts)
        st["path"] = slice_path(st["roll"])
        st["f"] = open_slice(st["path"])
        st["lines"] = 0
        print(f"[daemon] rolled over -> {os.path.basename(st['path'])} "
              f"(next {st['roll']:%m-%d %H:%M})")
        kick_report(closed_path, closed_lines)

    def timer_loop():
        """Force the rollover at the boundary even if the device is silent."""
        while not stop.is_set():
            wait = (st["roll"] - datetime.datetime.now()).total_seconds()
            if wait > 0:
                stop.wait(min(wait, 30))     # re-check at least every 30 s
                continue
            with lock:
                if datetime.datetime.now() >= st["roll"]:
                    do_rollover(datetime.datetime.now())

    print("=" * 66)
    print("  AXUM CONTINUOUS CAPTURE")
    print("  >> Press CTRL+R ONCE if no lines appear in ~20 s.")
    print("  >> Then leave this running - it auto-slices + reports at 11 PM daily.")
    print("  >> CTRL+C to stop.")
    print(f"  Logging to    : {st['path']}")
    print(f"  Next rollover : {st['roll']:%Y-%m-%d %H:%M}")
    print("=" * 66)

    timer = threading.Thread(target=timer_loop, daemon=True)
    timer.start()
    proc = None
    try:
        # Reattach loop: when the device reboots (its USB-CDC re-enumerates on
        # reset), espflash loses the port and exits. Continuous capture must
        # survive that - so we just relaunch espflash and keep going. This is
        # essential because the firmware reboot-loops on the Wi-Fi ESP_ERR_TIMEOUT
        # bug, especially at night; we want to CAPTURE that, not die with it.
        while not stop.is_set():
            proc = subprocess.Popen(
                capture_cmd(),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=None,             # inherit console stdin so CTRL+R reaches espflash
                text=True,
                bufsize=1,
                encoding="utf-8",
                errors="replace",
            )
            print(f"[daemon] espflash attached (PID {proc.pid}) -> {os.path.basename(st['path'])}")
            for line in proc.stdout:
                line = line.rstrip("\n")
                ts = datetime.datetime.now()
                with lock:
                    if ts >= st["roll"]:      # timer usually beats us; harmless if so
                        do_rollover(ts)
                    stamp = ts.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
                    st["f"].write(f"[{stamp}] {line}\n")
                    st["f"].flush()
                    st["lines"] += 1
                print(line)               # echo so capture is visibly live
            proc.wait()
            if stop.is_set():
                break
            print("[daemon] espflash exited (device reset / USB re-enumerate) "
                  "- reattaching in 3 s ...")
            stop.wait(3)
    except KeyboardInterrupt:
        print("\n[daemon] CTRL+C - stopping capture.")
    finally:
        stop.set()
        with lock:
            try:
                st["f"].close()
            except Exception:
                pass
        if proc:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        print("[daemon] stopped.")


if __name__ == "__main__":
    main()
