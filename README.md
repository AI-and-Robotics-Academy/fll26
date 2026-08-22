# fll26

Code Repo for FLL 2026 team

## FireWatch

Run locally at `http://127.0.0.1:8080`:

```bash
uv run wfp
```

### Connect a Raspberry Pi

FireWatch accepts Pi JSON telemetry at `POST /api/devices/<device-id>/telemetry`. The included `raspberry_pi_sender.py` is a hardware-ready starting point: install `requests`, replace the `read_*` examples with GPIO code for your DHT22, smoke sensor/ADC, and anemometer, then set its coordinates to the Pi's real location.

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
