import React from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../contexts/AuthContext";

/** Pages a person with an unfinished account must still be able to reach. */
const EXEMPT = new Set([
  "/account-setup",
  "/terms",
  "/privacy",
  "/guidelines",
  "/child-safety",
  "/reset-password",
  "/forgot-password",
]);

/**
 * A signed-in account missing its birthdate, gender, country or a current legal
 * acceptance goes to /account-setup before anything else, then back to where it was.
 *
 * It waits for nothing: while the status is loading the page renders as usual, so the
 * map is never held behind a network round-trip. The server refuses what an unfinished
 * account may not do regardless; this is the courtesy of saying why.
 */
export function AccountSetupGate({ children }: { children: React.ReactNode }) {
  const { user, accountSetupComplete } = useAuth();
  const location = useLocation();

  if (user && accountSetupComplete === false && !EXEMPT.has(location.pathname)) {
    return (
      <Navigate
        to="/account-setup"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  return <>{children}</>;
}
