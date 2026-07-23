import React from "react";
import { SignIn } from "@clerk/react";
import { AuthShell, clerkAppearance } from "../components/AuthShell";

export default function Login() {
  return (
    <AuthShell mode="sign-in">
      <SignIn
        routing="hash"
        signUpUrl="/signup"
        fallbackRedirectUrl="/"
        appearance={clerkAppearance}
      />
    </AuthShell>
  );
}
