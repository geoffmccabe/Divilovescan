// A small dependency-free line/area chart.
//
// Charting libraries are heavy and would have to be restyled to obey the skin
// tokens anyway; an SVG path costs a few dozen lines and inherits the theme for
// free. Deliberately minimal: no gridlines or axis furniture on the card
// preview, since at that size they're noise.

export interface Point {
  x: string; // day
  y: number;
}

interface Props {
  points: Point[];
  height?: number;
  /** Card previews drop axes, labels and hover entirely. */
  mini?: boolean;
  /** Formats the value in the axis and the hover readout. */
  fmt?: (n: number) => string;
  color?: string;
}

const W = 1000; // viewBox width; the SVG scales to its container

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}

export function Chart({ points, height = 260, mini = false, fmt, color }: Props) {
  if (points.length < 2) {
    return (
      <div className="chart-pending" style={{ height: mini ? 110 : height }}>
        <span>No data</span>
      </div>
    );
  }

  const ys = points.map((p) => p.y);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  // A flat series would divide by zero; give it a nominal band so it draws as a
  // straight line rather than vanishing.
  const min = lo === hi ? lo - 1 : lo;
  const max = lo === hi ? hi + 1 : hi;

  const padL = mini ? 0 : 62;
  const padR = mini ? 0 : 8;
  const padT = mini ? 4 : 10;
  const padB = mini ? 4 : 22;
  const innerW = W - padL - padR;
  const innerH = height - padT - padB;

  const x = (i: number) => padL + (i / (points.length - 1)) * innerW;
  const y = (v: number) => padT + innerH - ((v - min) / (max - min)) * innerH;

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join("");
  const area = `${line}L${x(points.length - 1).toFixed(1)},${padT + innerH}L${x(0).toFixed(1)},${padT + innerH}Z`;
  const stroke = color ?? "hsl(var(--primary))";
  const f = fmt ?? ((n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 }));

  // Labels only where they'd be legible.
  const ticks = mini ? [] : niceTicks(min, max);
  const dateAt = (i: number) => points[Math.min(points.length - 1, Math.max(0, i))].x;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      className="chartsvg"
      style={{ height: mini ? 110 : height }}
      role="img"
      aria-label={`${points.length} data points from ${points[0].x} to ${points[points.length - 1].x}`}
    >
      <defs>
        <linearGradient id={`g-${stroke}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={padL}
            x2={W - padR}
            y1={y(t)}
            y2={y(t)}
            stroke="hsl(var(--border))"
            strokeWidth="1"
            opacity="0.5"
          />
          <text
            x={padL - 6}
            y={y(t)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="11"
            fill="hsl(var(--muted-foreground))"
          >
            {f(t)}
          </text>
        </g>
      ))}

      <path d={area} fill={`url(#g-${stroke})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={mini ? 2 : 1.8} vectorEffect="non-scaling-stroke" />

      {!mini && (
        <>
          <text x={padL} y={height - 6} fontSize="11" fill="hsl(var(--muted-foreground))">
            {dateAt(0)}
          </text>
          <text x={W - padR} y={height - 6} textAnchor="end" fontSize="11" fill="hsl(var(--muted-foreground))">
            {dateAt(points.length - 1)}
          </text>
        </>
      )}
    </svg>
  );
}
