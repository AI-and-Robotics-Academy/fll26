#!/usr/bin/env bash
# Start FireWatch locally and share it through a temporary Cloudflare URL.
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed yet. Install it first, then run this script again."
  exit 1
fi

started_server="false"
server_pid=""
tunnel_pid=""
tunnel_log="/tmp/firewatch-cloudflared.log"

cleanup() {
  if [ -n "$tunnel_pid" ]; then
    kill "$tunnel_pid" 2>/dev/null || true
  fi
  if [ "$started_server" = "true" ] && [ -n "$server_pid" ]; then
    kill "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if ! curl --silent --fail http://127.0.0.1:8080/ >/dev/null; then
  echo "Starting FireWatch on http://127.0.0.1:8080 ..."
  uv run flask --app wfp run --host 127.0.0.1 --port 8080 --no-reload &
  server_pid=$!
  started_server="true"

  for _ in {1..20}; do
    if curl --silent --fail http://127.0.0.1:8080/ >/dev/null; then
      break
    fi
    sleep 1
  done

  if ! curl --silent --fail http://127.0.0.1:8080/ >/dev/null; then
    echo "FireWatch did not start. Check the error message above."
    exit 1
  fi
fi

echo "FireWatch is ready. Cloudflare will print your temporary public link below."
echo "Press Ctrl+C when you want to turn the public link off."
rm -f "$tunnel_log"
cloudflared tunnel --url http://127.0.0.1:8080 --logfile "$tunnel_log" &
tunnel_pid=$!

for _ in {1..20}; do
  public_url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$tunnel_log" 2>/dev/null | head -n 1 || true)
  if [ -n "$public_url" ]; then
    echo ""
    echo "Public FireWatch link: $public_url"
    break
  fi
  sleep 1
done

wait "$tunnel_pid"
