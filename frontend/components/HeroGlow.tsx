/**
 * Decorative backdrop for the homepage hero: several overlapping soft lights
 * (deep teal + apricot, a little pale highlight) blurred together on near-black,
 * with fine grain to avoid gradient banding. Inline SVG, ~1 KB, no image file.
 *
 * Teal is the hero's second hue so the page isn't apricot-only; apricot stays
 * the brand accent. `xMaxYMid slice` keeps the glow (right side) in frame on
 * narrow screens, where the sides get cropped.
 */
export default function HeroGlow({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1200 340"
      preserveAspectRatio="xMaxYMid slice"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    >
      <defs>
        <filter id="hero-glow-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="70" />
        </filter>
        <filter id="hero-glow-grain">
          <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="9" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .06 0" />
        </filter>
      </defs>
      <rect width="1200" height="340" fill="#0f1214" />
      <g filter="url(#hero-glow-blur)">
        <ellipse cx="1020" cy="320" rx="250" ry="140" fill="#F2A65A" opacity=".65" />
        <ellipse cx="740" cy="110" rx="320" ry="170" fill="#1f5a5e" opacity=".8" />
        <ellipse cx="1160" cy="60" rx="200" ry="120" fill="#2f7a74" opacity=".45" />
        <ellipse cx="880" cy="260" rx="150" ry="80" fill="#F2DCB0" opacity=".3" />
      </g>
      <rect width="1200" height="340" filter="url(#hero-glow-grain)" />
    </svg>
  );
}
