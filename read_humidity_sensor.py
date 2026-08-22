#!/usr/bin/env python3
"""Read the digital output (DO) from an MH-series humidity sensor module.

Wiring for this script:
  VCC -> Raspberry Pi physical pin 1 (3.3V only)
  GND -> Raspberry Pi physical pin 6 (GND)
  DO  -> Raspberry Pi physical pin 11 (GPIO17)

The DO pin is a threshold signal, not an exact humidity percentage. Turn the
small adjustment screw on the sensor module to choose when it changes state.
"""

import atexit
import os
from pathlib import Path
import signal
from time import sleep, time

from gpiozero import DigitalInputDevice


GPIO_PIN = 17  # GPIO17 is physical header pin 11.
PID_FILE = Path("/tmp/firewatch-humidity-reader.pid")


def stop_older_readers() -> None:
    """Stop only older copies of this exact script so GPIO17 is free."""
    script_name = Path(__file__).name
    this_pid = os.getpid()
    stopped = []

    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit() or int(entry.name) == this_pid:
            continue
        try:
            command = (entry / "cmdline").read_bytes().decode(errors="ignore")
        except (FileNotFoundError, PermissionError):
            continue
        executable = command.split("\0", 1)[0]
        if script_name in command and "python" in Path(executable).name:
            try:
                os.kill(int(entry.name), signal.SIGTERM)
                stopped.append(entry.name)
            except (ProcessLookupError, PermissionError):
                continue

    if stopped:
        print(f"Stopped older humidity reader(s): {', '.join(stopped)}")
        deadline = time() + 2
        while time() < deadline:
            if all(not Path(f"/proc/{pid}").exists() for pid in stopped):
                break
            sleep(0.1)


def claim_single_reader() -> None:
    """Ensure only one terminal-launched copy of this reader keeps running."""
    if PID_FILE.exists():
        try:
            old_pid = int(PID_FILE.read_text().strip())
            command = Path(f"/proc/{old_pid}/cmdline").read_bytes().decode(errors="ignore")
            if old_pid != os.getpid() and Path(__file__).name in command:
                os.kill(old_pid, signal.SIGTERM)
                print(f"Stopped earlier humidity reader: {old_pid}")
        except (FileNotFoundError, ProcessLookupError, ValueError, PermissionError):
            pass
    PID_FILE.write_text(str(os.getpid()))

    def remove_pid_file() -> None:
        if PID_FILE.exists() and PID_FILE.read_text().strip() == str(os.getpid()):
            PID_FILE.unlink()

    atexit.register(remove_pid_file)


def main() -> None:
    # Most comparator modules pull DO LOW when their threshold is triggered.
    # We always show the raw HIGH/LOW value so the wiring is unambiguous.
    stop_older_readers()
    claim_single_reader()
    sensor = DigitalInputDevice(GPIO_PIN, pull_up=False)
    print("Humidity sensor reader started. Press Ctrl+C to stop.")
    print("Reading digital threshold output on GPIO17 (physical pin 11).")

    try:
        while True:
            raw_value = "LOW" if sensor.value else "HIGH"
            threshold = "TRIGGERED" if not sensor.value else "not triggered"
            print(f"DO: {raw_value} — humidity threshold is {threshold}")
            sleep(1)
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        sensor.close()


if __name__ == "__main__":
    main()
