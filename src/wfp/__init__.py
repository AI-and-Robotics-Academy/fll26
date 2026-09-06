from datetime import UTC, datetime
import os

from flask import Flask, jsonify, render_template, request
from openai import APIConnectionError, APIStatusError, AuthenticationError, OpenAI, RateLimitError


DEVICES = [
    {"id": "FW-01", "name": "Bridle Trails", "location": "Northwest Redmond", "lat": 47.699, "lng": -122.154, "status": "online", "battery": 88, "temperature": 31.6, "humidity": 19, "air_humidity": 43, "last_seen": "Demo data"},
    {"id": "FW-02", "name": "Education Hill", "location": "Northeast Redmond", "lat": 47.702, "lng": -122.075, "status": "warning", "battery": 64, "temperature": 36.2, "humidity": 12, "air_humidity": 28, "last_seen": "Demo data"},
    {"id": "FW-03", "name": "Marymoor", "location": "Southeast Redmond", "lat": 47.645, "lng": -122.084, "status": "online", "battery": 91, "temperature": 29.8, "humidity": 28, "air_humidity": 56, "last_seen": "Demo data"},
    {"id": "FW-04", "name": "Sammamish Valley", "location": "Southwest Redmond", "lat": 47.642, "lng": -122.155, "status": "offline", "battery": 22, "temperature": 27.4, "humidity": 33, "air_humidity": 48, "last_seen": "Demo data"},
]

ALERTS = [
    {"id": "AL-104", "device_id": "FW-02", "type": "low_humidity", "title": "Low humidity threshold", "detail": "Humidity fell to 12% at Education Hill.", "severity": "warning", "time": "8 min ago", "open": True, "acknowledged": False},
    {"id": "AL-103", "device_id": "FW-01", "type": "sensor_check", "title": "Sensor check completed", "detail": "Bridle Trails sensor check completed successfully.", "severity": "info", "time": "42 min ago", "open": True, "acknowledged": False},
    {"id": "AL-102", "device_id": "FW-03", "type": "wind_advisory", "title": "Wind advisory cleared", "detail": "Wind speed returned below the configured threshold.", "severity": "resolved", "time": "2 hr ago", "open": False, "acknowledged": True},
]


def utc_timestamp() -> str:
    return datetime.now(UTC).isoformat()


def device_status(humidity: float) -> str:
    return "warning" if humidity <= 10 else "online"


def next_alert_id() -> str:
    return f"AL-{105 + len(ALERTS):03d}"


def update_humidity_alert(device: dict) -> None:
    """Open an alert for dry conditions and resolve it once conditions recover."""
    existing = next((alert for alert in ALERTS if alert["device_id"] == device["id"] and alert.get("type") == "low_humidity" and alert["open"]), None)
    if device["humidity"] <= 15 and existing is None:
        ALERTS.insert(0, {"id": next_alert_id(), "device_id": device["id"], "type": "low_humidity", "title": "Low humidity threshold", "detail": f"Humidity fell to {device['humidity']:.0f}% at {device['name']}.", "severity": "warning", "time": "Just now", "open": True, "acknowledged": False})
    elif device["humidity"] > 15 and existing:
        existing.update({"detail": f"Humidity recovered to {device['humidity']:.0f}% at {device['name']}.", "severity": "resolved", "time": "Just now", "open": False, "acknowledged": True})


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["INGEST_TOKEN"] = os.getenv("FIREWATCH_INGEST_TOKEN", "")

    @app.get("/")
    def dashboard():
        return render_template("index.html", devices=DEVICES, alerts=ALERTS)

    @app.get("/api/devices")
    def devices():
        return jsonify(DEVICES)

    @app.get("/api/alerts")
    def alerts():
        return jsonify(ALERTS)

    @app.post("/api/alerts/<alert_id>/acknowledge")
    def acknowledge_alert(alert_id: str):
        alert = next((item for item in ALERTS if item["id"] == alert_id), None)
        if alert is None:
            return jsonify({"error": "Alert not found"}), 404
        alert["acknowledged"] = True
        return jsonify({"message": "Alert acknowledged", "alert": alert})

    @app.post("/api/chat")
    def chat():
        """Answer FireWatch questions with an OpenAI model and live device context."""
        if not os.getenv("OPENAI_API_KEY"):
            return jsonify({"error": "The FireWatch AI needs an OPENAI_API_KEY on this server."}), 503

        data = request.get_json(silent=True) or {}
        message = str(data.get("message", "")).strip()
        if not message or len(message) > 1_500:
            return jsonify({"error": "Ask one question with up to 1,500 characters."}), 400

        history = data.get("history", [])[-8:]
        if not isinstance(history, list):
            history = []
        conversation = []
        for item in history:
            if isinstance(item, dict) and item.get("role") in {"user", "assistant"}:
                text = str(item.get("content", ""))[:1_500]
                if text:
                    conversation.append({"role": item["role"], "content": text})
        conversation.append({"role": "user", "content": message})

        device_summary = "; ".join(
            f"{device['name']}: {device['temperature']}°C, humidity {device['humidity']}%, air humidity {device['air_humidity']}%, status {device['status']}"
            for device in DEVICES
        )
        instructions = (
            "You are FireWatch AI, a friendly wildfire-prevention dashboard helper. "
            "Use the live device summary below when relevant. Explain in short, clear language suitable for a fifth grader. "
            "Never claim that a sensor reading proves a fire or guarantees safety. For an immediate fire or danger, tell the user to call local emergency services. "
            f"Live device summary: {device_summary}"
        )
        try:
            response = OpenAI().responses.create(
                model=os.getenv("FIREWATCH_AI_MODEL", "gpt-5-mini"),
                instructions=instructions,
                input=conversation,
                store=False,
            )
            return jsonify({"reply": response.output_text})
        except AuthenticationError:
            return jsonify({"error": "OpenAI did not accept this API key. Check that you copied the whole key, then restart FireWatch."}), 401
        except RateLimitError:
            return jsonify({"error": "OpenAI needs billing credits or has reached its usage limit. Ask an adult to check the OpenAI billing page."}), 429
        except APIConnectionError:
            return jsonify({"error": "FireWatch cannot reach OpenAI right now. Check the internet connection and try again."}), 503
        except APIStatusError as error:
            app.logger.exception("FireWatch AI request failed")
            return jsonify({"error": f"OpenAI could not run the FireWatch AI model (status {error.status_code}). Check the API project settings."}), 502
        except Exception:
            app.logger.exception("FireWatch AI request failed")
            return jsonify({"error": "FireWatch AI could not answer right now. Please try again."}), 502

    @app.post("/api/devices/<device_id>/telemetry")
    def ingest_telemetry(device_id: str):
        """Accept a Raspberry Pi JSON payload and update its real map marker."""
        token = app.config["INGEST_TOKEN"]
        if token and request.headers.get("X-FireWatch-Token") != token:
            return jsonify({"error": "Invalid ingest token"}), 401
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Send a JSON telemetry object"}), 400
        required = ("temperature", "humidity", "air_humidity", "lat", "lng")
        missing = [field for field in required if field not in data]
        if missing:
            return jsonify({"error": "Missing fields: " + ", ".join(missing)}), 400
        try:
            values = {field: float(data[field]) for field in required}
        except (TypeError, ValueError):
            return jsonify({"error": "Telemetry values must be numbers"}), 400
        if not -90 <= values["lat"] <= 90 or not -180 <= values["lng"] <= 180:
            return jsonify({"error": "Invalid latitude or longitude"}), 400
        device = next((item for item in DEVICES if item["id"] == device_id), None)
        if device is None:
            device = {"id": device_id, "name": data.get("name", device_id), "location": data.get("location", "Raspberry Pi sensor"), "battery": 0}
            DEVICES.append(device)
        device.update(values)
        device["battery"] = int(data.get("battery", device.get("battery", 0)))
        device["name"] = str(data.get("name", device["name"]))
        device["location"] = str(data.get("location", device["location"]))
        device["status"] = device_status(values["humidity"])
        device["last_seen"] = utc_timestamp()
        update_humidity_alert(device)
        return jsonify({"message": "Telemetry received", "device": device})

    @app.post("/api/devices/<device_id>/action")
    def device_action(device_id: str):
        device = next((item for item in DEVICES if item["id"] == device_id), None)
        if not device:
            return jsonify({"error": "Device not found"}), 404
        action = request.get_json(silent=True) or {}
        return jsonify({
            "message": f"{action.get('action', 'Command').title()} sent to {device['name']}",
            "device": device_id,
        })

    return app


app = create_app()


def main() -> None:
    app.run(
        host=os.getenv("FIREWATCH_HOST", "127.0.0.1"),
        port=int(os.getenv("FIREWATCH_PORT", "8080")),
        debug=True,
    )
