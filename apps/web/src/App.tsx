import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { PublicOnly, RequireAuth, RequirePermission } from './auth/guards';
import { AppShell } from './layout/AppShell';
import { AccountPage } from './pages/AccountPage';
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { RegisterPage } from './pages/RegisterPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { UsersPage } from './pages/UsersPage';
import { MemberDetailPage } from './pages/members/MemberDetailPage';
import {
  MemberCreatePage,
  MemberEditPage,
} from './pages/members/MemberFormPage';
import { MembersListPage } from './pages/members/MembersListPage';
import { LibraryPage } from './pages/library/LibraryPage';

export function App() {
  return (
    <AuthProvider>
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
              element={<PlaceholderPage title="Eventos" />}
            />
            <Route
              path="finance"
              element={
                <RequirePermission permission="FINANCE_TRANSACTION_READ">
                  <PlaceholderPage title="Financeiro" />
                </RequirePermission>
              }
            />
            <Route path="*" element={<PlaceholderPage title="Módulo" />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
