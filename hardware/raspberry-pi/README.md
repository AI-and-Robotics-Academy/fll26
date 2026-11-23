# Raspberry Pi sensor node

Scripts by **Luke** (`feature/luke-pi-telemetry`). They send readings to the
WildGuard master app, which shows them on the console map, the alerts page and
the Devices page with a white "LIVE" ring.

## 1. Start the app on the laptop

```bash
npm run dev -- --host 0.0.0.0
```

Find the laptop's Wi‑Fi IP (for example `192.168.1.10`). The Pi and laptop must
be on the same network.

## 2. Send readings from the Pi

```bash
cd hardware/raspberry-pi
pip install requests            # or: uv sync
FIREWATCH_URL=http://192.168.1.10:8080 FIREWATCH_DEVICE_ID=FW-01 python3 raspberry_pi_sender.py
```

`raspberry_pi_sender.py` (Luke) posts every 60 seconds. Replace
`read_temperature_humidity()` with real sensor code (for example a DHT22) and set
`lat` / `lng` to where the Pi sits.

The API contract is the same one Luke built for the Flask app:

| | |
| --- | --- |
| Endpoint | `POST /api/devices/<device-id>/telemetry` |
| Required JSON | `temperature` (°C); `humidity` and/or `soil_moisture` (%); `lat`, `lng` (unless registered with GPS) |
| Optional JSON | `name`, `location`, `air_humidity`, `wind_mph` / `wind_kph`, `wind_dir`, `battery`, `elevation_m` |
| Security | If `FIREWATCH_INGEST_TOKEN` is set on the laptop, the Pi must send the same value in the `X-FireWatch-Token` header |

No Pi handy? Use **Devices → Send a test reading** in the app, or:

```bash
curl -X POST http://localhost:8080/api/devices/FW-01/telemetry \
  -H 'Content-Type: application/json' \
  -d '{"temperature":38,"humidity":12,"lat":47.61,"lng":-122.20}'
```

## Viren's bridge: DS18B20 temperature + soil moisture

`wildguard_bridge.py` reads a DS18B20 probe (GPIO4, enable 1-Wire in
`raspi-config`) and a soil-moisture module (`DO` on GPIO27), pushes a reading
every 5 minutes, and serves a password-protected `/status` page (`?key=` or
`X-Auth-Key` header). Register the unit with GPS on the Devices page and the
Pi doesn't need to send coordinates.

```bash
WILDGUARD_URL=http://192.168.1.10:8080 WILDGUARD_DEVICE_ID=WW-01 STATUS_KEY=choose-a-password \
  python3 wildguard_bridge.py
```

The app also accepts `wind_mph` or `wind_kph` and `wind_dir` (degrees or
`"SW"`), and `soil_moisture` (%). Send at least `humidity` or `soil_moisture`.

## Digital humidity sensors (MH-series)

`read_humidity_sensor.py` reads `DO` on **GPIO17** (physical pin 11).
`read_air_moisture_sensor.py` reads `DO` on **GPIO22** (physical pin 15).

Wire `VCC` to **3.3V** (pin 1) and `GND` to pin 6. Never power the module from
5V while `DO` connects straight to the Pi.

```bash
sudo apt install python3-gpiozero
uv run python read_humidity_sensor.py
```

These print `HIGH` / `LOW` — a threshold set by the module's screw, not a
percentage. An exact percentage needs `AO` wired through an ADC such as an
MCP3008.

Run from a terminal, not Thonny. If Thonny ran the reader before, press its red
**Stop** button so it releases the GPIO pin.
