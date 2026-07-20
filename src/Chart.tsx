// A small dependency-free line/area chart.
//
// Charting libraries are heavy and would have to be restyled to obey the skin
// tokens anyway; an SVG path costs a few dozen lines and inherits the theme for
// free. Card previews drop all axis furniture, which is noise at that size.

export interface Point {
  x: string; // YYYY-MM-DD
  y: number;
}

interface Props {
  points: Point[];
  height?: number;
  mini?: boolean;
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

interface XTick {
  i: number;
  label?: string;
  major: boolean;
}

/**
 * Time ticks sized to the window: years over long spans, months (labelled) with
 * unlabelled day marks over a year or less. Driven by the actual dates rather
 * than by evenly slicing the index, so ticks land on real calendar boundaries.
 */
function xTicks(points: Point[]): XTick[] {
  if (points.length < 2) return [];
  const spanDays =
    (Date.parse(points[points.length - 1].x) - Date.parse(points[0].x)) / 86400000;
  const out: XTick[] = [];

  if (spanDays > 366) {
    let lastYear = "";
    points.forEach((p, i) => {
      const [y, m, d] = p.x.split("-");
      // First point of each calendar year — Jan 1 where the data has it.
      if (y !== lastYear && (m === "01" || i === 0)) {
        if (i > 0 || d === "01") out.push({ i, label: y, major: true });
        lastYear = y;
      }
    });
    return out;
  }

  let lastMonth = "";
  points.forEach((p, i) => {
    const [y, m, d] = p.x.split("-");
    const ym = `${y}-${m}`;
    if (ym !== lastMonth) {
      lastMonth = ym;
      const month = new Date(Date.parse(p.x)).toLocaleString(undefined, { month: "short" });
      out.push({ i, label: spanDays > 120 ? month : `${month} ${d}`, major: true });
    } else if (spanDays <= 120) {
      // Small unlabelled day marks, thinned so they stay legible.
      const every = spanDays <= 40 ? 1 : 5;
      if (Number(d) % every === 0) out.push({ i, major: false });
    }
  });
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
  const padR = mini ? 0 : 10;
  const padT = mini ? 4 : 10;
  const padB = mini ? 4 : 30;
  const innerW = W - padL - padR;
  const innerH = height - padT - padB;

  const x = (i: number) => padL + (i / (points.length - 1)) * innerW;
  const y = (v: number) => padT + innerH - ((v - min) / (max - min)) * innerH;

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join("");
  const area = `${line}L${x(points.length - 1).toFixed(1)},${padT + innerH}L${x(0).toFixed(1)},${padT + innerH}Z`;
  const stroke = color ?? "hsl(var(--primary))";
  const f = fmt ?? ((n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 }));
  const gid = `g${stroke.replace(/[^a-z0-9]/gi, "")}`;

  const yTicks = mini ? [] : niceTicks(min, max);
  const tx = mini ? [] : xTicks(points);
  const axisY = padT + innerH;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      className="chartsvg"
      style={{ height: mini ? 110 : height }}
      role="img"
      aria-label={`${points.length} points from ${points[0].x} to ${points[points.length - 1].x}`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>

      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeWidth="1" opacity="0.5" />
          <text x={padL - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="hsl(var(--muted-foreground))">
            {f(t)}
          </text>
        </g>
      ))}

      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={mini ? 2 : 1.8} vectorEffect="non-scaling-stroke" />

      {!mini && (
        <g>
          <line x1={padL} x2={W - padR} y1={axisY} y2={axisY} stroke="hsl(var(--border))" strokeWidth="1" />
          {tx.map((t, k) => (
            <g key={`x${k}`}>
              <line
                x1={x(t.i)}
                x2={x(t.i)}
                y1={axisY}
                y2={axisY + (t.major ? 6 : 3)}
                stroke="hsl(var(--border))"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              {t.label && (
                <text
                  x={x(t.i)}
                  y={axisY + 18}
                  textAnchor="middle"
                  fontSize="11"
                  fill="hsl(var(--muted-foreground))"
                >
                  {t.label}
                </text>
              )}
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
