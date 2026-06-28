#!/usr/bin/env python3
"""
run_capture.py  -  one command for the whole daily routine.

What it does:
  1. Starts `espflash monitor` capturing into a dated log in D:\\scheduler\\logs.
     -> You press CTRL+R ONCE to start the device streaming (firmware needs it).
  2. Keeps capturing until you press CTRL+C (e.g. at the end of the day).
  3. Automatically runs process_log.py on the EXACT log it just captured,
     so the report is generated and shows up in the web UI.

So your daily routine is:  python run_capture.py  ->  CTRL+R  ->  (walk away)
                           ...later...  CTRL+C  ->  report appears.

No filenames to type, no path mismatches.
"""

import os
import sys
import signal
import datetime
import subprocess

# ----------------------------------------------------------------- config ----
PORT       = "COM11"
LOG_DIR    = r"D:\scheduler\logs"
PROCESSOR  = r"D:\scheduler\process_log.py"
PYTHON     = sys.executable            # same python running this script

# ------------------------------------------------------------------ main -----
def main():
    os.makedirs(LOG_DIR, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    log_path = os.path.join(LOG_DIR, f"esp32-monitor-{stamp}.log")

    print("=" * 60)
    print("  AXUM CAPTURE")
    print("  >> Press CTRL+R ONCE to start the device streaming.")
    print("  >> Press CTRL+C when you're done to stop and make the report.")
    print(f"  Logging to: {log_path}")
    print("=" * 60)
    print()

    # Open the log file; espflash output (stdout+stderr) is written to it with a
    # host timestamp prefix, and also echoed to this console so you can see it
    # and press CTRL+R. espflash reads CTRL+R from the console as usual.
    captured_ok = False
    with open(log_path, "w", encoding="utf-16") as f:
        proc = subprocess.Popen(
            ["espflash", "monitor", "--port", PORT],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=None,                 # inherit console stdin so CTRL+R works
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
        )
        try:
            for line in proc.stdout:
                line = line.rstrip("\n")
                ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
                stamped = f"[{ts}] {line}"
                print(stamped)             # show on screen
                f.write(stamped + "\n")     # save to file
                f.flush()
                captured_ok = True
        except KeyboardInterrupt:
            print("\n[run_capture] CTRL+C received - stopping capture...")
        finally:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                proc.kill()

    if not captured_ok:
        print("\n[run_capture] No data was captured (did you press CTRL+R?). "
              "Skipping report.")
        return

    print(f"\n[run_capture] Capture saved: {log_path}")
    print("[run_capture] Generating report...\n")

    # Hand the EXACT log we just captured to the processor.
    result = subprocess.run([PYTHON, PROCESSOR, log_path])
    if result.returncode == 0:
        print("\n[run_capture] Done - refresh the browser to see the report.")
    else:
        print(f"\n[run_capture] Report step exited with code {result.returncode}. "
              "If it was a rate limit, wait a minute and run:\n"
              f"    python {PROCESSOR} {log_path}")


if __name__ == "__main__":
    main()
