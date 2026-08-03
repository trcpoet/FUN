import type { PointerEvent as ReactPointerEvent } from "react";
import { useAnimate, useReducedMotion } from "motion/react";

/** Shared press easing. Mirrors SPORT_ROW_EASE in CreateGameModal. */
export const PRESS_EASE: [number, number, number, number] = [0.22, 0.1, 0.22, 1];

const PRESS_SCALE = 0.96;
const PRESS_DURATION_S = 0.58;
const SETTLE_DURATION_S = 0.72;

/**
 * Pointer-driven press so release always eases back (`whileTap` alone feels abrupt).
 *
 * Spread the returned handlers onto a `motion.*` element and pass `ref` to it. Call the hook once
 * per element — each needs its own animation scope. No-ops under `prefers-reduced-motion`.
 */
export function usePressAnimation() {
  const [scope, animate] = useAnimate();
  const reduceMotion = useReducedMotion();

  const settle = () => {
    if (reduceMotion || !scope.current) return;
    void animate(scope.current, { scale: 1 }, { duration: SETTLE_DURATION_S, ease: PRESS_EASE });
  };

  const press = () => {
    if (reduceMotion || !scope.current) return;
    void animate(scope.current, { scale: PRESS_SCALE }, { duration: PRESS_DURATION_S, ease: PRESS_EASE });
  };

  return {
    ref: scope,
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return; // primary button / touch only
      press();
    },
    onPointerUp: settle,
    onPointerLeave: settle,
    onPointerCancel: settle,
  };
}
