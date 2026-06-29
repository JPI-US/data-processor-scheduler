import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import type { CardSpec } from "@/lib/report/metrics";
import type { NumericPoint, NumericRegression } from "@/lib/report/trends";

export function MetricCard({
  card,
  series,
  regression,
}: {
  card: CardSpec;
  series: NumericPoint[];
  regression: NumericRegression;
}) {
  const trail = series.slice(-14).map((p, i) => ({ i, value: p.value }));
  const current = regression.current;
  const flagged = regression.severity !== "ok";
  const flagTone =
    card.direction === "higher-better" ? "text-[var(--color-fail)]" : "text-[var(--color-fail)]";

  return (
    <div className="rounded-lg border border-rule bg-surface px-4 py-3.5">
      <div className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {card.label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-serif text-3xl font-medium tabular-nums text-foreground">
          {current === null ? "—" : card.format(current)}
        </span>
        {card.suffix && current !== null && (
          <span className="text-sm text-muted-foreground">{card.suffix}</span>
        )}
      </div>
      <div className="-mx-1 mt-1 h-8">
        {trail.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trail} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--color-ink)"
                strokeWidth={1}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center text-xs italic text-muted-foreground">
            trend appears after 3 nights
          </div>
        )}
      </div>
      <div className="mt-1 h-4 text-xs">
        {flagged && regression.reason ? (
          <span className={`font-medium ${flagTone}`}>{regression.reason}</span>
        ) : regression.baseline !== null && current !== null ? (
          <span className="text-muted-foreground">
            7d avg <span className="tabular-nums">{card.format(regression.baseline)}</span>
            {card.suffix ?? ""}
          </span>
        ) : (
          <span className="text-muted-foreground italic">building baseline</span>
        )}
      </div>
    </div>
  );
}
