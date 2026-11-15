
import { Navigate, Route, Routes } from "react-router-dom";

import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import RegistrationSuccessPage from "./pages/RegistrationSuccessPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

import DashboardPage from "./pages/DashboardPage";
import CompanySelectPage from "./pages/CompanySelectPage";
import CompanySetupPage from "./pages/CompanySetupPage";
import ModuleSelectionPage from "./pages/ModuleSelectionPage";
import ModulesPage from "./pages/ModulesPage";

import ProtectedRoute from "./routes/ProtectedRoute";
import GuestRoute from "./routes/GuestRoute";

import DashboardLayout from "./layouts/DashboardLayout";

import "./App.css";

export default function App() {
  return (
    <Routes>
      {/* Guest-only routes */}
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/forgot-password"
          element={<ForgotPasswordPage />}
        />
      </Route>

      {/* Public routes - email links */}
      <Route
        path="/registration-success"
        element={<RegistrationSuccessPage />}
      />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/companies" element={<CompanySelectPage />} />
        <Route path="/company-setup" element={<CompanySetupPage />} />

        <Route
          path="/onboarding/modules"
          element={<ModuleSelectionPage />}
        />

        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/modules" element={<ModulesPage />} />
        </Route>
      </Route>

      {/* Default routes */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}