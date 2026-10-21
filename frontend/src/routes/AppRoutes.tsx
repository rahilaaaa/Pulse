import { Navigate, Route, Routes } from "react-router-dom";
import { ForgotPasswordPage } from "../features/auth/ForgotPasswordPage";
import { LoginPage } from "../features/auth/LoginPage";
import { ResetPasswordPage } from "../features/auth/ResetPasswordPage";
import { NoticePage } from "../features/auth/NoticePage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { VerifyEmailPage } from "../features/auth/VerifyEmailPage";
import { WelcomePage } from "../features/auth/WelcomePage";
import { AuditLogsPage } from "../features/platform/AuditLogsPage";
import { CompaniesPage } from "../features/platform/CompaniesPage";
import { OverviewPage } from "../features/platform/OverviewPage";
import { PlatformLayout } from "../features/platform/PlatformLayout";
import { RecordsPage } from "../features/platform/RecordsPage";
import { UsersPage } from "../features/platform/UsersPage";
import { OnboardingPage } from "../features/onboarding/OnboardingPage";
import { AcceptInvitePage } from "../features/workspace/AcceptInvitePage";
import { AuditPage } from "../features/workspace/AuditPage";
import { BillingPage } from "../features/workspace/BillingPage";
import { LeavePage } from "../features/workspace/LeavePage";
import { ModulesPage } from "../features/workspace/ModulesPage";
import { NotificationsPage } from "../features/workspace/NotificationsPage";
import { OrganizationPage } from "../features/workspace/OrganizationPage";
import { OverviewPage as CompanyOverviewPage } from "../features/workspace/OverviewPage";
import { RolesPage } from "../features/workspace/RolesPage";
import { SettingsPage } from "../features/workspace/SettingsPage";
import { StudioPage } from "../features/workspace/StudioPage";
import { PeoplePage } from "../features/workspace/UsersPage";
import { WorkspaceLayout } from "../features/workspace/WorkspaceLayout";
import { HomeRedirect } from "../shared/auth/HomeRedirect";
import { RequireSession } from "../shared/auth/RequireSession";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/privacy" element={<NoticePage kind="privacy" />} />
      <Route path="/terms" element={<NoticePage kind="terms" />} />
      <Route path="/security" element={<NoticePage kind="security" />} />
      <Route element={<RequireSession />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/invitations/accept" element={<AcceptInvitePage />} />
        <Route path="/app" element={<WorkspaceLayout />}>
          <Route index element={<CompanyOverviewPage />} />
          <Route path="people" element={<PeoplePage />} />
          <Route path="users" element={<Navigate to="/app/people" replace />} />
          <Route path="organization" element={<OrganizationPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="studio" element={<StudioPage />} />
          <Route path="modules" element={<ModulesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="hrms" element={<LeavePage />} />
        </Route>
        <Route path="/platform" element={<PlatformLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="companies" element={<CompaniesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="billing" element={<RecordsPage title="Subscriptions and billing" path="/api/v1/platform/billing/" />} />
          <Route path="modules" element={<RecordsPage title="Modules" path="/api/v1/platform/modules/" />} />
          <Route path="audit" element={<AuditLogsPage />} />
          <Route path="settings" element={<RecordsPage title="Platform settings" path="/api/v1/platform/settings/" />} />
        </Route>
      </Route>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
