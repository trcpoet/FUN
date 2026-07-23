import React from "react";
import { SignUp } from "@clerk/react";
import { AuthShell, clerkAppearance } from "../components/AuthShell";

export default function SignUpPage() {
  return (
    <AuthShell mode="sign-up">
      <SignUp
        routing="hash"
        signInUrl="/login"
        fallbackRedirectUrl="/"
        appearance={clerkAppearance}
      />
    </AuthShell>
  );
}
