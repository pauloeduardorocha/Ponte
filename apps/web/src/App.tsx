import { lazy, Suspense, type ReactNode } from 'react';
const ReimbursementsPage = lazy(() =>
  import('./pages/reimbursements/ReimbursementsPage').then((m) => ({
    default: m.ReimbursementsPage,
  })),
);
const ReimbursementRequestPage = lazy(() =>
  import('./pages/reimbursements/ReimbursementsPage').then((m) => ({
    default: m.ReimbursementRequestPage,
  })),
);
import { LinearProgress, Typography } from '@mui/material';
import { APP_VERSION } from './lib/app-version';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import {
  PublicOnly,
  RequireAuth,
  RequirePermission,
  RequireRouteAccess,
} from './auth/guards';
const AppShell = lazy(() =>
  import('./layout/AppShell').then((m) => ({ default: m.AppShell })),
);
const AccountPage = lazy(() =>
  import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const PublicEventRegistration = lazy(() =>
  import('./pages/events/PublicEventRegistration').then((m) => ({
    default: m.PublicEventRegistration,
  })),
);
const EventWorkspace = lazy(() =>
  import('./pages/events/EventWorkspace').then((m) => ({
    default: m.EventWorkspace,
  })),
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/ForgotPasswordPage').then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
const RegisterPage = lazy(() =>
  import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const ResetPasswordPage = lazy(() =>
  import('./pages/ResetPasswordPage').then((m) => ({
    default: m.ResetPasswordPage,
  })),
);

const MemberDetailPage = lazy(() =>
  import('./pages/members/MemberDetailPage').then((m) => ({
    default: m.MemberDetailPage,
  })),
);
const MemberCreatePage = lazy(() =>
  import('./pages/members/MemberFormPage').then((m) => ({
    default: m.MemberCreatePage,
  })),
);
const MemberEditPage = lazy(() =>
  import('./pages/members/MemberFormPage').then((m) => ({
    default: m.MemberEditPage,
  })),
);
const MembersListPage = lazy(() =>
  import('./pages/members/MembersListPage').then((m) => ({
    default: m.MembersListPage,
  })),
);
const FinancePage = lazy(() =>
  import('./pages/FinancePage').then((m) => ({ default: m.FinancePage })),
);
const AuditPage = lazy(() =>
  import('./pages/AuditPage').then((m) => ({ default: m.AuditPage })),
);
const OperationsDashboardPage = lazy(() =>
  import('./pages/operations/OperationsDashboardPage').then((m) => ({
    default: m.OperationsDashboardPage,
  })),
);
const InboxPage = lazy(() =>
  import('./pages/operations/InboxPage').then((m) => ({
    default: m.InboxPage,
  })),
);
const OperationsPage = lazy(() =>
  import('./pages/operations/OperationsPage').then((m) => ({
    default: m.OperationsPage,
  })),
);
const LibraryPage = lazy(() =>
  import('./pages/library/LibraryPage').then((m) => ({
    default: m.LibraryPage,
  })),
);
const VideosPage = lazy(() =>
  import('./pages/VideosPage').then((m) => ({ default: m.VideosPage })),
);

const PendingApprovalsPage = lazy(() =>
  import('./pages/PendingApprovalsPage').then((m) => ({
    default: m.PendingApprovalsPage,
  })),
);

export function App({ children }: { children?: ReactNode }) {
  return (
    <AuthProvider>
      <Suspense fallback={<LinearProgress aria-label="Carregando tela" />}>
        <Routes>
          <Route
            path="/events/:id/register"
            element={<PublicEventRegistration />}
          />
          <Route element={<PublicOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route element={<RequireAuth />}>
            <Route
              path="/pedir-reembolso"
              element={<ReimbursementRequestPage />}
            />
            <Route element={<AppShell />}>
              <Route element={<RequireRouteAccess />}>
                <Route index element={<DashboardPage />} />
                <Route
                  path="operations"
                  element={<OperationsDashboardPage />}
                />
                <Route
                  path="pending-approvals"
                  element={<PendingApprovalsPage />}
                />
                <Route path="inbox" element={<InboxPage />} />
                <Route path="my-events" element={<EventWorkspace />} />
                <Route path="account" element={<AccountPage />} />
                <Route path="reimbursements" element={<ReimbursementsPage />} />
                <Route path="library" element={<LibraryPage />} />
                <Route path="videos" element={<VideosPage />} />
                <Route path="videos/:playlistId" element={<VideosPage />} />
                <Route
                  path="members"
                  element={
                    <RequirePermission permission="MEMBER_READ">
                      <MembersListPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="members/new"
                  element={
                    <RequirePermission permission="MEMBER_CREATE">
                      <MemberCreatePage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="members/:id"
                  element={
                    <RequirePermission permission="MEMBER_READ">
                      <MemberDetailPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="members/:id/edit"
                  element={
                    <RequirePermission permission="MEMBER_UPDATE">
                      <MemberEditPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="users"
                  element={<Navigate to="/members" replace />}
                />
                <Route
                  path="events"
                  element={<OperationsPage key="events" resource="events" />}
                />
                <Route path="finance" element={<FinancePage />} />
                <Route path="audit" element={<AuditPage />} />
                <Route
                  path="visitors"
                  element={
                    <OperationsPage key="visitors" resource="visitors" />
                  }
                />
                <Route
                  path="follow-ups"
                  element={
                    <OperationsPage key="follow-ups" resource="follow-ups" />
                  }
                />
                <Route
                  path="small-groups"
                  element={
                    <OperationsPage
                      key="small-groups"
                      resource="small-groups"
                    />
                  }
                />
                <Route
                  path="ministries"
                  element={
                    <OperationsPage key="ministries" resource="ministries" />
                  }
                />
                <Route
                  path="schedules"
                  element={
                    <OperationsPage key="schedules" resource="schedules" />
                  }
                />
                <Route
                  path="notifications"
                  element={
                    <OperationsPage
                      key="notifications"
                      resource="notifications"
                    />
                  }
                />
                <Route
                  path="notification-templates"
                  element={
                    <OperationsPage
                      key="notification-templates"
                      resource="notification-templates"
                    />
                  }
                />
                <Route path="*" element={<PlaceholderPage title="Módulo" />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </Suspense>
      <Typography
        component="footer"
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', textAlign: 'center', py: 2, px: 2 }}
      >
        A Ponte · v{APP_VERSION}
      </Typography>
      {children}
    </AuthProvider>
  );
}

export default App;
