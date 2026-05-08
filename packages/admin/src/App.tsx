import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { RequireSuperAdmin } from './components/RequireSuperAdmin';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './pages/LoginPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { UsersPage } from './pages/UsersPage';
import { BrandingPage } from './pages/BrandingPage';
import { SystemSettingsPage } from './pages/SystemSettingsPage';
import { AuditLogPage } from './pages/AuditLogPage';

function AdminLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<RequireSuperAdmin />}>
            <Route element={<AdminLayout />}>
              <Route index element={<Navigate to="/companies" replace />} />
              <Route path="/companies" element={<CompaniesPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/settings/branding" element={<BrandingPage />} />
              <Route path="/settings/system" element={<SystemSettingsPage />} />
              <Route path="/audit" element={<AuditLogPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
