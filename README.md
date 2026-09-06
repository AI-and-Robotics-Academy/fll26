# fll26

Code Repo for FLL 2026 team

## FireWatch

Run locally at `http://127.0.0.1:8080`:

```bash
uv run wfp
```

### Connect a Raspberry Pi

FireWatch accepts Pi JSON telemetry at `POST /api/devices/<device-id>/telemetry`. The included `raspberry_pi_sender.py` is a hardware-ready starting point: install `requests`, replace its sensor-reading example with your GPIO code, then set its coordinates to the Pi's real location.

For Pi access over your local network, run on the dashboard computer with:

```bash
FIREWATCH_HOST=0.0.0.0 uv run wfp
```

Set `FIREWATCH_URL` on the Pi to the dashboard computer's LAN address, such as `http://192.168.1.10:8080`. For a shared network, set the same `FIREWATCH_INGEST_TOKEN` environment variable on both the dashboard host and Pi; FireWatch will require it in the request header.

### Share a temporary public link

After installing `cloudflared`, run:

```bash
./start_public_firewatch.sh
```

Cloudflare prints a temporary `trycloudflare.com` URL. Press `Ctrl+C` to turn it off.

### Turn on FireWatch AI

Create an OpenAI API key, then set it only in your terminal before starting
FireWatch. Do not put the key in source code or commit it to Git.

```bash
export OPENAI_API_KEY="your_secret_key_here"
./start_public_firewatch.sh
```

The **Ask FireWatch AI** button will then answer questions using the current
device readings. You can optionally choose a different model with
`FIREWATCH_AI_MODEL`.

### Read the humidity sensor's digital output

For an MH-series sensor module wired with `DO` on physical pin 11 (GPIO17),
connect `VCC` to **3.3V** (physical pin 1) and `GND` to physical pin 6. Do not
power the module from 5V when its `DO` pin connects directly to the Pi.

On the Raspberry Pi, install the GPIO library once if necessary:

```bash
sudo apt install python3-gpiozero
```

Then run:

```bash
uv run python read_humidity_sensor.py
```

If it reports a GPIO permission error, sign out and back in so your `gpio`
group membership takes effect, then rerun the same `uv` command.

Run this from a terminal, not from Thonny. If Thonny previously ran the reader,
press its red **Stop** button first so it releases GPIO17. The script then stops
older terminal copies of itself automatically before reading the sensor.

This reads the module's `DO` threshold as `HIGH` or `LOW`. It cannot report an
exact humidity percentage until `AO` is connected through an analog-to-digital
converter (ADC), such as an MCP3008.

### Read a second air-moisture sensor on GPIO22

For a sensor with its `DO` wire on physical pin 15 (GPIO22), use **3.3V** for
`VCC`, a GND pin for `GND`, and run:

```bash
uv run python read_air_moisture_sensor.py
```

It prints the raw digital state: `HIGH` or `LOW`.
