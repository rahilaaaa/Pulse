import { Navigate, Route, Routes } from "react-router-dom";
import { ForgotPasswordPage } from "../features/auth/ForgotPasswordPage";
import { LoginPage } from "../features/auth/LoginPage";
import { ResetPasswordPage } from "../features/auth/ResetPasswordPage";
import { NoticePage } from "../features/auth/NoticePage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { VerifyEmailPage } from "../features/auth/VerifyEmailPage";
import { WelcomePage } from "../features/auth/WelcomePage";
import { AuditLogsPage } from "../features/platform/AuditLogsPage";
import { BillingPlansPage } from "../features/platform/BillingPlansPage";
import { CompaniesPage } from "../features/platform/CompaniesPage";
import { CompanyDetailPage } from "../features/platform/CompanyDetailPage";
import { ModuleCatalogPage } from "../features/platform/ModuleCatalogPage";
import { ModuleDetailPage } from "../features/platform/ModuleDetailPage";
import { OnboardingMonitorPage } from "../features/platform/OnboardingMonitorPage";
import { OverviewPage } from "../features/platform/OverviewPage";
import { PermissionsCatalogPage } from "../features/platform/PermissionsCatalogPage";
import { PlatformHealthPage } from "../features/platform/PlatformHealthPage";
import { PlatformLayout } from "../features/platform/PlatformLayout";
import { PlatformSettingsPage } from "../features/platform/PlatformSettingsPage";
import { RolesPage as PlatformRolesPage } from "../features/platform/RolesPage";
import { SubscriptionsPage } from "../features/platform/SubscriptionsPage";
import { UserDetailPage } from "../features/platform/UserDetailPage";
import { UsersPage } from "../features/platform/UsersPage";
import { OnboardingPage } from "../features/onboarding/OnboardingPage";
import { AcceptInvitePage } from "../features/workspace/AcceptInvitePage";
import { AuditPage } from "../features/workspace/AuditPage";
import { BillingPage } from "../features/workspace/BillingPage";
import { CommercePage } from "../features/workspace/CommercePage";
import { CrmPage } from "../features/workspace/CrmPage";
import { LeavePage } from "../features/workspace/LeavePage";
import { HrmsPage } from "../features/workspace/HrmsPage";
import { ModulesPage } from "../features/workspace/ModulesPage";
import { NotificationsPage } from "../features/workspace/NotificationsPage";
import { OrganizationPage } from "../features/workspace/OrganizationPage";
import { OverviewPage as CompanyOverviewPage } from "../features/workspace/OverviewPage";
import { PartiesPage } from "../features/workspace/PartiesPage";
import { ProjectsPage } from "../features/workspace/ProjectsPage";
import { RolesPage } from "../features/workspace/RolesPage";
import { CustomEntityRecordsPage } from "../features/workspace/CustomEntityRecordsPage";
import { CustomEntitiesIndexPage } from "../features/workspace/CustomEntitiesIndexPage";
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
      <Route path="/invitations/accept" element={<AcceptInvitePage />} />
      <Route element={<RequireSession />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
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
          <Route path="modules/:slug" element={<ModulesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="custom-entities" element={<CustomEntitiesIndexPage />} />
          <Route path="custom-entities/:entityId" element={<CustomEntityRecordsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="hrms" element={<HrmsPage />} />
          <Route path="hrms/leave" element={<LeavePage />} />
          <Route path="parties" element={<PartiesPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="crm" element={<CrmPage />} />
          <Route path="commerce" element={<CommercePage />} />
        </Route>
        <Route path="/platform" element={<PlatformLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="companies" element={<CompaniesPage />} />
          <Route path="companies/:companyId" element={<CompanyDetailPage />} />
          <Route path="onboarding" element={<OnboardingMonitorPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="users/:userId" element={<UserDetailPage />} />
          <Route path="roles" element={<PlatformRolesPage />} />
          <Route path="permissions" element={<PermissionsCatalogPage />} />
          <Route path="billing" element={<SubscriptionsPage />} />
          <Route path="billing/plans" element={<BillingPlansPage />} />
          <Route path="modules" element={<ModuleCatalogPage />} />
          <Route path="modules/:slug" element={<ModuleDetailPage />} />
          <Route path="settings" element={<PlatformSettingsPage />} />
          <Route path="audit" element={<AuditLogsPage />} />
          <Route path="health" element={<PlatformHealthPage />} />
        </Route>
      </Route>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
