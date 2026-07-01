import { FunAppIconLoader } from "./FunAppIconLoader";

type FunOrbitLoaderProps = {
  tagline?: string;
  className?: string;
};

export function FunOrbitLoader(props: FunOrbitLoaderProps) {
  return <FunAppIconLoader {...props} />;
}

export { FunAppIconLoader };
