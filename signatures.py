"""
signatures.py - log-line classification for digest preprocessing.

Each line is classified into a category with a mode:
  EVENT  - meaningful; kept verbatim in the digest's EVENT LOG.
  ROLLUP - repeating noise; collapsed to one "CATEGORY Nx window example" line.
Unmatched lines are UNKNOWN: collapsed by normalized form when they repeat a lot
(value-varying telemetry), else kept verbatim so novel/rare issues are not hidden.

Data-driven: add a (regex, category, mode) row to extend. FIRST MATCH WINS, so
EVENT signatures are listed before the broad ROLLUP ones. Sourced from
ERRORS_AND_WARNINGS.md (firmware) + frequency-mining real logs.
"""
import re

EVENT = "event"
ROLLUP = "rollup"

_PREFIX = re.compile(r"^[IWEDV] \(\d+\)\s*")
_HEX = re.compile(r"0x[0-9a-fA-F]+")
_FLOAT = re.compile(r"-?\d+\.\d+")
_INT = re.compile(r"-?\d+")
_BROKER = re.compile(r"[a-z0-9]+-ats\.iot\.[a-z0-9.\-]+")


def message(body):
    """Strip the 'LEVEL (uptime)' prefix to get the bare message text."""
    return _PREFIX.sub("", body).strip()


def normalize(body):
    """Aggressively normalize so value-varying repeats collapse to one key:
    strip level/uptime, hex addresses, floats, ints, broker hostname."""
    b = message(body)
    b = _HEX.sub("0xN", b)
    b = _BROKER.sub("<broker>", b)
    b = _FLOAT.sub("N.N", b)
    b = _INT.sub("N", b)
    return b.strip()


# (pattern, category, mode) - matched against message(body). FIRST MATCH WINS.
_SIGS = [
    # ---------------- CRASH / fatal (never miss) ----------------
    (r"panicked at", "CRASH", EVENT),
    (r"abort\(\) was called", "CRASH", EVENT),
    (r"Guru Meditation", "CRASH", EVENT),
    (r"Task watchdog got triggered", "CRASH", EVENT),
    (r"Backtrace:", "CRASH", EVENT),
    (r"^Unrecoverable:", "CRASH", EVENT),
    (r"^Rebooting", "CRASH", EVENT),
    (r"Wi-Fi connection failed", "CRASH", EVENT),
    (r"^Could.?t get namespace|Wifi ssid not found|Wifi password not found", "CRASH", EVENT),

    # ---------------- boot KEY lines (keep) ----------------
    (r"^rst:0x", "BOOT", EVENT),
    (r"App version:", "BOOT", EVENT),
    (r"Calling app_main\(\)", "BOOT", EVENT),
    (r"trust_nvs_state", "BOOT", EVENT),

    # ---------------- mode / encoder health (keep) ----------------
    (r"Motion mode:", "MODE", EVENT),
    (r"switching to StepperOnly", "MODE", EVENT),
    (r"Encoder disabled for the day", "MODE", EVENT),
    (r"Encoder fault detected", "ENCODER", EVENT),
    (r"Encoder probe", "ENCODER", EVENT),
    (r"probes exhausted", "ENCODER", EVENT),
    (r"MOVE_ABORT", "ENCODER", EVENT),
    (r"STALL_DETECTED", "ENCODER", EVENT),
    (r"heading drift", "ENCODER", EVENT),

    # ---------------- homing (keep) ----------------
    (r"Homing OK", "HOMING", EVENT),
    (r"Homing FAILED", "HOMING", EVENT),
    (r"found home", "HOMING", EVENT),
    (r"limit switch could not be found", "HOMING", EVENT),
    (r"Limit switch pressed during homing", "HOMING", EVENT),
    (r"Limit switch not found during", "HOMING", EVENT),
    (r"Home verification failed", "HOMING", EVENT),
    (r"Moving to sleep position", "HOMING", EVENT),
    (r"forced encoder zero", "HOMING", EVENT),

    # ---------------- MQTT transitions (keep boundaries) ----------------
    (r"MQTT Connected", "MQTT", EVENT),
    (r"MQTT client created", "MQTT", EVENT),
    (r"Boot diagnostic MQTT", "MQTT", EVENT),

    # ---------------- persistence (keep FAILURES; roll up routine stores) ------
    (r"NVS persist disabled", "NVS", EVENT),
    (r"Failed to store", "NVS", EVENT),
    (r"Restored heading from NVS", "NVS", EVENT),
    (r"No valid encoder snapshot", "NVS", EVENT),

    # ---------------- OTA / temp / rtc (keep) ----------------
    (r"[Vv]ersion compare", "OTA", EVENT),
    (r"Boot validation failed", "OTA", EVENT),
    (r"[Ff]irmware update", "OTA", EVENT),
    (r"current firmware version", "OTA", EVENT),
    (r"HDC1080", "TEMP", EVENT),
    (r"too hot|Severely high temperature|in danger|started to degrade", "TEMP", EVENT),
    (r"NTP sync failed", "RTC", EVENT),
    (r"RTC read error|RTC time outside|RTC read failed", "RTC", EVENT),

    # ================= ROLLUP (repeating noise) =================
    (r"getaddrinfo\(\) returns", "DNS_FAIL", ROLLUP),
    (r"Error transport connect", "MQTT_CONN_FAIL", ROLLUP),
    (r"MQTT error: ESP_FAIL", "MQTT_CONN_FAIL", ROLLUP),
    (r"MQTT Disconnected, will queue", "MQTT_CONN_FAIL", ROLLUP),
    (r"Retrying momentarilly", "MQTT_CONN_FAIL", ROLLUP),
    (r"Failed to open (a )?new connection", "MQTT_CONN_FAIL", ROLLUP),
    (r"Poll read error|poll_read select error", "MQTT_CONN_FAIL", ROLLUP),
    (r"MQTT client not connected", "MQTT_CONN_FAIL", ROLLUP),
    (r"Wi-Fi reconnect:", "WIFI_RECONNECT", ROLLUP),
    (r"Failed to reconnect to Wi-Fi", "WIFI_RECONNECT", ROLLUP),
    (r"Wifi disconnected, attempting", "WIFI_RECONNECT", ROLLUP),
    (r"^wifi:(state:|.*beacon|.*bcn|.*scan|ap_loss)", "WIFI_STATE", ROLLUP),
    # routine sun-tracking telemetry (the good-day token hog)
    (r"NOAA inputs|NOAA time cross-check|Tracking in progress|Angle Offset|Sun Angle|Actual Location",
     "TRACKING_CYCLE", ROLLUP),
    (r"Actual Heading:|Current datetime:|Tracking loop duration|Tracking move|tracking_done",
     "TRACKING_CYCLE", ROLLUP),
    (r"published successfully", "MQTT_PUBLISH", ROLLUP),
    (r"Stored .* in NVS", "NVS_STORE", ROLLUP),
    (r"forced encoder zero", "HOMING_CAL", ROLLUP),
    (r"Waiting for NTP sync", "NTP_WAIT", ROLLUP),
    (r"SOFT_LIMIT clamp", "SOFT_LIMIT", ROLLUP),
    # boot-banner noise (message() has stripped the 'I (uptime)' prefix already)
    (r"^(boot:|esp_image:|heap_init:|spi_flash:|cpu_start:|main_task:|clk|gpio:|sleep:|pp |"
     r"net80211:|wifi:(Init|wifi|mode|enable|config|driver)|wifi_init:|phy_init:|i2c:|"
     r"rmt|pcnt|timer_group:|intr_alloc:|esp_psram)", "BOOT_NOISE", ROLLUP),
    (r"^(ESP-ROM:|Build:|SPIWP:|mode:DIO|load:0x|entry 0x|Saved PC|## Label)", "BOOT_NOISE", ROLLUP),
]

SIGNATURES = [(re.compile(p), c, m) for p, c, m in _SIGS]


def classify(body):
    """Return (category, mode) for a line, or (None, None) if unknown."""
    msg = message(body)
    for rx, cat, mode in SIGNATURES:
        if rx.search(msg):
            return cat, mode
    return None, None
