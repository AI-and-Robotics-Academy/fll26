import { describe, expect, it } from "vitest";
import { generateReadings } from "@/lib/sensors";
import { findPlace, summarizeArea } from "@/lib/public-info";
import { ingestTelemetry, listLiveDevices, removeLiveDevice } from "@/lib/telemetry.server";

describe("Main snapshot integration", () => {
  it("includes the three imported Eastside sensors", () => {
    const readings = generateReadings();
    expect(readings).toHaveLength(11);
    expect(readings.filter((r) => ["PI-09", "PI-10", "PI-11"].includes(r.id)).map((r) => r.name))
      .toEqual(["Tiger Mountain", "Cougar Mountain", "Bridle Trails"]);
  });

  it("keeps real telemetry available for both console and public summaries", () => {
    const id = "MERGE-TEST";
    try {
      ingestTelemetry(id, { temperature: 24.5, humidity: 40, lat: 47.6101, lng: -122.2015 });
      const live = listLiveDevices().filter((r) => r.id === id);
      expect(live[0]?.temperatureF).toBe(76.1);
      expect(live[0]?.humidityPct).toBe(40);
      expect(live[0]?.source).toBe("live");
      expect(summarizeArea(findPlace("Bellevue"), live).coverage).toBe(1);
    } finally {
      removeLiveDevice(id);
    }
  });
});