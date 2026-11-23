import { RISK_HEX, type RiskLevel } from "@/lib/sensors";

const LEVEL_LABEL: Record<RiskLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  extreme: "Extreme",
};

// Band edges match assessRisk(): 0-25 low, 25-50 moderate, 50-75 high, 75-100 extreme.
const BANDS: { from: number; to: number; level: RiskLevel }[] = [
  { from: 0, to: 25, level: "low" },
  { from: 25, to: 50, level: "moderate" },
  { from: 50, to: 75, level: "high" },
  { from: 75, to: 100, level: "extreme" },
];

const R = 80;
const CX = 100;
const CY = 100;

/** Point on the half-circle for a 0-100 value (0 = left, 100 = right). */
function point(value: number, radius = R) {
  const angle = Math.PI * (1 - value / 100);
  return { x: CX + radius * Math.cos(angle), y: CY - radius * Math.sin(angle) };
}

function arc(from: number, to: number) {
  const a = point(from);
  const b = point(to);
  return `M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`;
}

/**
 * Viren's fire-risk gauge: a 0-100 half dial colored green → yellow → red,
 * with a needle that animates to the current score.
 */
export function RiskGauge({
  score,
  level,
  caption,
}: {
  score: number | null;
  level: RiskLevel | null;
  caption: string;
}) {
  const value = Math.max(0, Math.min(100, score ?? 0));
  // Rotate from -90° (score 0) to +90° (score 100).
  const needleDeg = -90 + (value / 100) * 180;
  const color = level ? RISK_HEX[level] : "var(--color-muted-foreground)";

  return (
    <figure className="flex flex-col items-center">
      <svg
        viewBox="0 0 200 118"
        className="w-full max-w-[260px]"
        role="img"
        aria-label={`Fire risk ${score ?? "unknown"} of 100`}
      >
        {BANDS.map((b) => (
          <path
            key={b.level}
            d={arc(b.from + 0.6, b.to - 0.6)}
            stroke={RISK_HEX[b.level]}
            strokeOpacity={level === b.level ? 1 : 0.35}
            strokeWidth={16}
            fill="none"
          />
        ))}
        <g
          style={{
            transform: `rotate(${needleDeg}deg)`,
            transformOrigin: `${CX}px ${CY}px`,
            transition: "transform 900ms cubic-bezier(.2,.8,.2,1)",
          }}
        >
          <line
            x1={CX}
            y1={CY}
            x2={CX}
            y2={CY - R + 14}
            stroke={color}
            strokeWidth={4}
            strokeLinecap="round"
          />
        </g>
        <circle
          cx={CX}
          cy={CY}
          r={7}
          fill={color}
          stroke="var(--color-background)"
          strokeWidth={2}
        />
      </svg>
      <figcaption className="-mt-1 text-center">
        <span className="metric-value tabular-nums" style={{ color }}>
          {score ?? "—"}
        </span>
        <span className="ml-2 font-display text-sm tracking-[0.14em] uppercase" style={{ color }}>
          {level ? LEVEL_LABEL[level] : "No data"}
        </span>
        <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
      </figcaption>
    </figure>
  );
}
