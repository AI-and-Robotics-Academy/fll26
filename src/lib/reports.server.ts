// Citizen smoke/fire reports (server memory, demo). Citizens submit from
// "My area"; firefighters see and acknowledge them on the Alerts page.

export interface CitizenReport {
  id: string;
  reporter: string;
  place: string;
  lat: number;
  lng: number;
  kind: "smoke" | "flames" | "other";
  note: string;
  createdAt: string;
  acknowledged: boolean;
}

const MAX_REPORTS = 50;
const g = globalThis as typeof globalThis & { __wildguardReports?: CitizenReport[] };
const reports: CitizenReport[] = (g.__wildguardReports ??= []);

export function addReport(input: Omit<CitizenReport, "id" | "createdAt" | "acknowledged">) {
  const report: CitizenReport = {
    ...input,
    id: `R-${Date.now().toString(36).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    acknowledged: false,
  };
  reports.unshift(report);
  reports.length = Math.min(reports.length, MAX_REPORTS);
  return report;
}

export const listReports = () => reports;

export function acknowledgeReport(id: string) {
  const report = reports.find((r) => r.id === id);
  if (report) report.acknowledged = true;
  return report ?? null;
}
