import { lazy, Suspense } from 'react';
import { LinearProgress } from '@mui/material';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { PublicOnly, RequireAuth, RequirePermission } from './auth/guards';
import { AppShell } from './layout/AppShell';
const AccountPage = lazy(() =>
  import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })),
);
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { RegisterPage } from './pages/RegisterPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
const UsersPage = lazy(() =>
  import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })),
);
import { MemberDetailPage } from './pages/members/MemberDetailPage';
import {
  MemberCreatePage,
  MemberEditPage,
} from './pages/members/MemberFormPage';
import { MembersListPage } from './pages/members/MembersListPage';
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

export function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<LinearProgress aria-label="Carregando tela" />}>
        <Routes>
          <Route element={<PublicOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="operations" element={<OperationsDashboardPage />} />
              <Route path="inbox" element={<InboxPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="library" element={<LibraryPage />} />
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
                element={
                  <RequirePermission permission="USER_READ">
                    <UsersPage />
                  </RequirePermission>
                }
              />
              <Route
                path="events"
                element={<OperationsPage key="events" resource="events" />}
              />
              <Route path="finance" element={<FinancePage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route
                path="visitors"
                element={<OperationsPage key="visitors" resource="visitors" />}
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
                  <OperationsPage key="small-groups" resource="small-groups" />
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
                path="attendance"
                element={
                  <OperationsPage key="attendance" resource="attendance" />
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
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}

export default App;
