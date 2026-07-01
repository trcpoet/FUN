import "../../styles/fun-app-icon.css";
import { FunAppIcon } from "./FunAppIcon";

type FunAppIconLoaderProps = {
  tagline?: string;
  className?: string;
};

export function FunAppIconLoader({ tagline = "Loading FUN…", className }: FunAppIconLoaderProps) {
  return (
    <div
      className={className ? `fun-app-icon-loader ${className}` : "fun-app-icon-loader"}
      role="status"
      aria-live="polite"
    >
      <div className="fun-app-icon-loader__stage" aria-hidden="true">
        <FunAppIcon />
      </div>
      <p className="fun-app-icon-loader__tagline">{tagline}</p>
    </div>
  );
}
