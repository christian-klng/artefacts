type FlagProps = { className?: string };

// 5-pointed star as an SVG polygon `points` string, centred at (cx, cy).
function starPoints(cx: number, cy: number, outer: number): string {
  const inner = outer * 0.382;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(
      `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`,
    );
  }
  return pts.join(" ");
}

// Flag of the European Union — 12 gold stars in a circle on blue.
export function EuFlag({ className }: FlagProps) {
  const stars = Array.from({ length: 12 }, (_, i) => {
    const a = (Math.PI / 6) * i - Math.PI / 2;
    const cx = 45 + 20 * Math.cos(a);
    const cy = 30 + 20 * Math.sin(a);
    return <polygon key={i} points={starPoints(cx, cy, 4)} fill="#FFCC00" />;
  });
  return (
    <svg
      viewBox="0 0 90 60"
      className={className}
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="90" height="60" fill="#003399" />
      {stars}
    </svg>
  );
}

// Flag of Germany — black, red and gold horizontal bands.
export function DeFlag({ className }: FlagProps) {
  return (
    <svg
      viewBox="0 0 5 3"
      preserveAspectRatio="none"
      className={className}
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="5" height="1" y="0" fill="#000000" />
      <rect width="5" height="1" y="1" fill="#DD0000" />
      <rect width="5" height="1" y="2" fill="#FFCE00" />
    </svg>
  );
}
