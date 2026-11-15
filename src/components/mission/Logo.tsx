export function Logo({
  variant = "full",
  animated = false,
}: {
  variant?: "full" | "mark";
  animated?: boolean;
}) {
  return (
    <span className="mission-logo">
      <svg viewBox="0 0 64 64" aria-hidden="true" className="logo-mark">
        <circle cx="32" cy="32" r="23" className="logo-disc" />
        <path d="M11 43 31 19 52 44M19 38Q32 30 47 43" className="logo-dune" />
        <ellipse
          cx="32"
          cy="33"
          rx="30"
          ry="11"
          transform="rotate(-25 32 33)"
          className="logo-orbit"
        />
        <g className={animated ? "orbit-dot animated" : "orbit-dot"}>
          <circle cx="56" cy="19" r="3" />
        </g>
      </svg>
      {variant === "full" && (
        <span className="wordmark">
          AMANAR<span>ALGERIA BEYOND EARTH</span>
        </span>
      )}
    </span>
  );
}
