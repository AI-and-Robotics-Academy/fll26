#!/usr/bin/env python3
"""WildGuard field-unit bridge (Viren's Wildfire Watch design).

Reads a DS18B20 temperature probe and a GPIO soil-moisture sensor, then pushes
a reading to the WildGuard app every 5 minutes. It also serves a small,
password-protected /status page so a crew can check the unit on the local
network.

Wiring
  DS18B20  : data -> GPIO4 (physical pin 7) with a 4.7 kΩ pull-up to 3.3V.
             Enable 1-Wire once:  sudo raspi-config  -> Interface -> 1-Wire
  Soil DO  : DO -> GPIO27 (physical pin 13), VCC -> 3.3V, GND -> GND.
             The module's screw sets the dry/wet threshold.

Run
  pip install requests gpiozero
  WILDGUARD_URL=http://192.168.1.10:8080 \
  WILDGUARD_DEVICE_ID=WW-01 \
  WILDGUARD_LAT=47.61 WILDGUARD_LNG=-122.20 \
  STATUS_KEY=choose-a-password \
  python3 wildguard_bridge.py

Environment
  WILDGUARD_URL          App address (laptop IP + port).            required
  WILDGUARD_DEVICE_ID    Unit id shown in the app.                   default WW-01
  WILDGUARD_NAME         Friendly name.                              default "Field unit"
  WILDGUARD_LOCATION     Place name.                                 default "Field"
  WILDGUARD_LAT/LNG      GPS position. Leave unset if you registered the unit
                         with coordinates on the Devices page.
  WILDGUARD_TOKEN        Same value as FIREWATCH_INGEST_TOKEN on the laptop.
  PUSH_SECONDS           Push interval.                              default 300
  STATUS_PORT            Port for /status.                           default 5000
  STATUS_KEY             Password for /status (?key= or X-Auth-Key). If unset,
                         /status is turned off.
"""

from __future__ import annotations

import glob
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import requests

URL = os.environ.get("WILDGUARD_URL", "http://192.168.1.10:8080").rstrip("/")
DEVICE_ID = os.environ.get("WILDGUARD_DEVICE_ID", "WW-01")
NAME = os.environ.get("WILDGUARD_NAME", "Field unit")
LOCATION = os.environ.get("WILDGUARD_LOCATION", "Field")
LAT = os.environ.get("WILDGUARD_LAT")
LNG = os.environ.get("WILDGUARD_LNG")
TOKEN = os.environ.get("WILDGUARD_TOKEN", "")
PUSH_SECONDS = int(os.environ.get("PUSH_SECONDS", "300"))
STATUS_PORT = int(os.environ.get("STATUS_PORT", "5000"))
STATUS_KEY = os.environ.get("STATUS_KEY", "")
SOIL_GPIO = 27

latest: dict = {}
lock = threading.Lock()


def read_ds18b20_c() -> float | None:
    """Temperature in °C from the first DS18B20 on the 1-Wire bus."""
    devices = glob.glob("/sys/bus/w1/devices/28-*/w1_slave")
    if not devices:
        return None
    with open(devices[0], encoding="utf-8") as handle:
        lines = handle.read().splitlines()
    if len(lines) < 2 or not lines[0].strip().endswith("YES"):
        return None
    _, _, raw = lines[1].partition("t=")
    return round(int(raw) / 1000.0, 2) if raw else None


def make_soil_reader():
    """Soil moisture as a percentage. A digital module only knows wet or dry,
    so this reports 60 % (wet) or 10 % (dry). Swap in an ADC (e.g. MCP3008)
    for a true percentage."""
    try:
        from gpiozero import DigitalInputDevice

        sensor = DigitalInputDevice(SOIL_GPIO, pull_up=False)
    except Exception as error:  # not on a Pi, or GPIO busy
        print(f"Soil sensor unavailable: {error}")
        return lambda: None
    # Most modules pull DO LOW when the soil is wet.
    return lambda: 60.0 if not sensor.value else 10.0


def push_loop(read_soil) -> None:
    headers = {"X-FireWatch-Token": TOKEN} if TOKEN else {}
    while True:
        temperature = read_ds18b20_c()
        soil = read_soil()
        if temperature is None or soil is None:
            print("Skipping push: temperature or soil reading unavailable.")
        else:
            payload = {
                "name": NAME,
                "location": LOCATION,
                "temperature": temperature,
                "soil_moisture": soil,
            }
            if LAT and LNG:
                payload.update({"lat": float(LAT), "lng": float(LNG)})
            with lock:
                latest.update(payload, recorded_at=time.strftime("%Y-%m-%dT%H:%M:%S"))
            try:
                response = requests.post(
                    f"{URL}/api/devices/{DEVICE_ID}/telemetry",
                    json=payload,
                    headers=headers,
                    timeout=10,
                )
                print(response.status_code, response.json().get("message") or response.text)
            except requests.RequestException as error:
                print(f"Could not reach WildGuard: {error}")
        time.sleep(PUSH_SECONDS)


class StatusHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 (http.server naming)
        parsed = urlparse(self.path)
        if parsed.path != "/status":
            self.send_error(404)
            return
        key = self.headers.get("X-Auth-Key") or parse_qs(parsed.query).get("key", [""])[0]
        if key != STATUS_KEY:
            self.send_error(401, "Missing or wrong key")
            return
        with lock:
            body = json.dumps({"device_id": DEVICE_ID, "latest": latest}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args) -> None:
        return


def main() -> None:
    read_soil = make_soil_reader()
    threading.Thread(target=push_loop, args=(read_soil,), daemon=True).start()
    if STATUS_KEY:
        print(f"Status page: http://<pi-ip>:{STATUS_PORT}/status?key=…")
        ThreadingHTTPServer(("0.0.0.0", STATUS_PORT), StatusHandler).serve_forever()
    else:
        print("STATUS_KEY not set — /status page is off. Pushing readings only.")
        while True:
            time.sleep(3600)


if __name__ == "__main__":
    main()
