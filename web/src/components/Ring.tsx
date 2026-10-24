/** One SVG arc ring. `progress` 0..1. The arc draws in via stroke-dashoffset when `visible` becomes true. */
export function RingArc({ r, stroke, progress, color, visible = true, cx, cy, animate = true, delayMs = 0 }: { r: number; stroke: number; progress: number; color: string; visible?: boolean; cx: number; cy: number; animate?: boolean; delayMs?: number }) {
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  const offset = visible ? circ * (1 - p) : circ;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#27272a" strokeWidth={stroke} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        className={animate ? 'ring-arc' : undefined}
        style={animate ? { transitionDelay: `${delayMs}ms` } : undefined}
      />
    </>
  );
}
