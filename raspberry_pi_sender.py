"""Example Raspberry Pi telemetry sender for FireWatch.

Install requests and replace the read_* functions with your GPIO sensor code.
"""
import os
import time

import requests

FIREWATCH_URL = os.getenv("FIREWATCH_URL", "http://192.168.1.10:8080")
DEVICE_ID = os.getenv("FIREWATCH_DEVICE_ID", "FW-01")
TOKEN = os.getenv("FIREWATCH_INGEST_TOKEN", "")


def read_temperature_humidity():
    # Example: DHT22 via adafruit_dht.DHT22(board.D4).temperature/humidity
    return 25.0, 35.0


def read_smoke():
    # MQ-series sensors need an ADC (such as MCP3008); return calibrated index.
    return 2.0


def read_wind_speed():
    # Convert anemometer pulse counts to km/h here.
    return 4.0


def send_reading():
    temperature, humidity = read_temperature_humidity()
    payload = {"name": "My Pi sensor", "location": "Set this location", "temperature": temperature, "humidity": humidity, "smoke": read_smoke(), "wind": read_wind_speed(), "battery": 90, "lat": 47.67399, "lng": -122.12151}
    headers = {"X-FireWatch-Token": TOKEN} if TOKEN else {}
    response = requests.post(f"{FIREWATCH_URL}/api/devices/{DEVICE_ID}/telemetry", json=payload, headers=headers, timeout=10)
    response.raise_for_status()
    print(response.json())


if __name__ == "__main__":
    while True:
        try:
            send_reading()
        except requests.RequestException as error:
            print(f"Could not send reading: {error}")
        time.sleep(60)
