import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { AuthProvider } from "./app/contexts/AuthContext";
import { RequireAuth } from "./app/components/RequireAuth";
import { RequireOnboarding } from "./app/components/RequireOnboarding";
import { PublicOnly } from "./app/components/PublicOnly";
import App from "./app/App.tsx";
import Login from "./app/pages/Login.tsx";
import SignUp from "./app/pages/SignUp.tsx";
import Onboarding from "./app/pages/Onboarding.tsx";
import Profile from "./app/pages/Profile.tsx";
import PublicProfile from "./app/pages/PublicProfile.tsx";
import Feed from "./app/pages/Feed.tsx";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route
          path="/login"
          element={
            <PublicOnly>
              <Login />
            </PublicOnly>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicOnly>
              <SignUp />
            </PublicOnly>
          }
        />
        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <Onboarding />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <RequireOnboarding>
                <Profile />
              </RequireOnboarding>
            </RequireAuth>
          }
        />
        <Route path="/feed" element={<Feed />} />
        <Route path="/athlete/:userId" element={<PublicProfile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);
  