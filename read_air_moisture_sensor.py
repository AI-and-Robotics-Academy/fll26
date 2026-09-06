#!/usr/bin/env python3
"""Print the raw DO value from an air-moisture sensor on GPIO22.

Wiring:
  VCC -> physical pin 1 (3.3V only)
  GND -> physical pin 6 (GND)
  DO  -> physical pin 15 (GPIO22)

Output: HIGH or LOW. The sensor's adjustment screw controls its trigger point.
"""

from time import sleep

from gpiozero import DigitalInputDevice


GPIO_PIN = 22  # GPIO22 is physical header pin 15.


def main() -> None:
    sensor = DigitalInputDevice(GPIO_PIN, pull_up=False)
    print("Reading raw DO values from GPIO22. Press Ctrl+C to stop.")
    try:
        while True:
            print("LOW" if sensor.value else "HIGH", flush=True)
            sleep(0.5)
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        sensor.close()


if __name__ == "__main__":
    main()
