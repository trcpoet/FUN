import "../../styles/fun-orbit-loader.css";

const SPORT_ICONS = ["🏀", "⚽", "🏈", "🎾", "🏐", "🏃"] as const;

type FunOrbitLoaderProps = {
  tagline?: string;
  className?: string;
};

export function FunOrbitLoader({ tagline = "Loading FUN…", className }: FunOrbitLoaderProps) {
  return (
    <div className={className ? `fun-orbit-loader ${className}` : "fun-orbit-loader"} role="status" aria-live="polite">
      <div className="fun-orbit-loader__stage" aria-hidden="true">
        <div className="fun-orbit-loader__orbit">
          {SPORT_ICONS.map((icon) => (
            <span key={icon} className="fun-orbit-loader__icon">
              {icon}
            </span>
          ))}
        </div>
        <div className="fun-orbit-loader__core">FUN</div>
      </div>
      <p className="fun-orbit-loader__tagline">{tagline}</p>
    </div>
  );
}
