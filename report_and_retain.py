#!/usr/bin/env python3
"""
report_and_retain.py <logfile>

Post-rollover step for capture_daemon.py. Given a just-closed daily slice it:
  1. skips empty/short slices (no junk reports);
  2. saves the preprocessed digest as digest-<date>.txt (lightweight history);
  3. generates the report (delegates to process_log.py, which isolates the API
     call so a 429 / network failure can't crash this wrapper);
  4. parses the verdict and applies raw-log retention:
       PASS                                  -> delete the raw slice
       WARN / FAIL / unparseable / API-fail  -> keep it, then prune kept raw
                                                slices to the most recent 5.

Safety rule: never delete raw data on any path where analysis did not succeed.
Stdlib only. Run by the daemon; can also be run by hand on any slice.
"""
import os
import re
import sys
import glob
import subprocess
import pathlib

import process_log as pl

MIN_SLICE_LINES = 50          # below this, treat as empty/junk
KEEP_FAILED     = 5           # retain at most this many non-PASS raw slices
PYTHON          = sys.executable
HERE            = os.path.dirname(os.path.abspath(__file__))
PROCESSOR       = os.path.join(HERE, "process_log.py")


def log(msg):
    print(f"[report_and_retain] {msg}", flush=True)


def parse_verdict(report_path):
    try:
        txt = pathlib.Path(report_path).read_text(encoding="utf-8")
    except OSError:
        return None
    m = re.search(r"^##\s*VERDICT:\s*(PASS|WARN|FAIL)", txt, re.M | re.I)
    return m.group(1).upper() if m else None


def prune_failed_logs():
    """Keep only the most recent KEEP_FAILED raw capture slices on disk."""
    logs = sorted(glob.glob(os.path.join(pl.LOG_DIR, "capture-*.log")))
    for old in logs[:-KEEP_FAILED] if len(logs) > KEEP_FAILED else []:
        try:
            os.remove(old)
            log(f"pruned old raw slice {os.path.basename(old)}")
        except OSError:
            pass


def main(log_path):
    if not os.path.exists(log_path):
        log(f"no such log: {log_path}")
        return 1

    rows, digest = pl.build_digest(log_path)
    date = pl.derive_report_date(rows, log_path)

    # 1. empty-slice guard -- no junk reports, drop the empty file
    if len(rows) < MIN_SLICE_LINES:
        log(f"slice {os.path.basename(log_path)} too short ({len(rows)} lines) - skipping")
        try:
            os.remove(log_path)
        except OSError:
            pass
        return 0

    # 2. save the digest as a permanent lightweight middle layer
    os.makedirs(pl.REPORTS_DIR, exist_ok=True)
    dpath = os.path.join(pl.REPORTS_DIR, f"digest-{date}.txt")
    pl._atomic_write(dpath, digest)
    log(f"saved {os.path.basename(dpath)} (~{len(digest)//4} tokens)")

    # 3. generate the report (isolated; a 429/API failure exits non-zero here)
    result = subprocess.run([PYTHON, PROCESSOR, log_path])
    if result.returncode != 0:
        log(f"report generation FAILED (exit {result.returncode}) - keeping raw log, "
            f"re-run later with: python process_log.py {log_path}")
        return result.returncode

    # 4. verdict-based retention of the raw slice
    report_path = os.path.join(pl.REPORTS_DIR, f"axum_report_{date}.md")
    verdict = parse_verdict(report_path)
    if verdict == "PASS":
        try:
            os.remove(log_path)
            log(f"PASS -> deleted raw {os.path.basename(log_path)}")
        except OSError:
            pass
    else:
        log(f"{verdict or 'UNPARSEABLE'} -> keeping raw {os.path.basename(log_path)}")
        prune_failed_logs()
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python report_and_retain.py <logfile>")
    sys.exit(main(sys.argv[1]))
