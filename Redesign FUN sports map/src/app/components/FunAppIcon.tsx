type FunAppIconProps = {
  className?: string;
  title?: string;
};

/** Neon map-pin mark; ring spins around viewBox center (16, 16). */
export function FunAppIcon({ className, title = "FUN" }: FunAppIconProps) {
  return (
    <svg
      className={className ? `fun-app-icon ${className}` : "fun-app-icon"}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <rect width="32" height="32" rx="6" fill="#0B0C10" />
      <circle cx="16" cy="16" r="13" stroke="#00F2FE" strokeWidth="1" strokeOpacity="0.15" />
      <g className="fun-app-icon__ring-spin">
        <path
          d="M16 3C23.1797 3 29 8.8203 29 16C29 23.1797 23.1797 29 16 29"
          stroke="#00F2FE"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
      <path
        d="M16 6C11.5 6 8 9.5 8 14C8 19.5 16 26 16 26C16 26 24 19.5 24 14C24 9.5 20.5 6 16 6Z"
        fill="#00F2FE"
        fillOpacity="0.1"
        stroke="#00F2FE"
        strokeWidth="1.5"
      />
      <path
        className="fun-app-icon__play-pulse"
        d="M14.5 11L19 14L14.5 17V11Z"
        fill="#00F2FE"
      />
      <path
        d="M12 24H20"
        stroke="#00F2FE"
        strokeWidth="0.5"
        strokeOpacity="0.4"
        strokeDasharray="1 1"
      />
    </svg>
  );
}
