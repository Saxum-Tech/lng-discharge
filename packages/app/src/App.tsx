import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { RequireAuth } from './components/RequireAuth';
import { Navbar } from './components/Navbar';
import { LoginPage } from './pages/LoginPage';
import { CalendarPage } from './pages/CalendarPage';
import { DayDetailPage } from './pages/DayDetailPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { MyEntriesPage } from './pages/MyEntriesPage';
import { ProfilePage } from './pages/ProfilePage';
import { useTheme } from './contexts/ThemeContext';

function AppFooter() {
  const { settings } = useTheme();
  if (!settings?.footer_text) return null;
  return (
    <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-400">
      {settings.footer_text}
    </footer>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">{children}</main>
      <AppFooter />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<RequireAuth />}>
              <Route
                element={
                  <AppLayout>
                    {/* Outlet rendered by RequireAuth → need inner wrapper */}
                    <Navigate to="/calendar" replace />
                  </AppLayout>
                }
                path="/"
              />
              <Route
                path="/calendar"
                element={
                  <AppLayout>
                    <CalendarPage />
                  </AppLayout>
                }
              />
              <Route
                path="/day/:date"
                element={
                  <AppLayout>
                    <DayDetailPage />
                  </AppLayout>
                }
              />
              <Route
                path="/analysis"
                element={
                  <AppLayout>
                    <AnalysisPage />
                  </AppLayout>
                }
              />
              <Route
                path="/my-entries"
                element={
                  <AppLayout>
                    <MyEntriesPage />
                  </AppLayout>
                }
              />
              <Route
                path="/profile"
                element={
                  <AppLayout>
                    <ProfilePage />
                  </AppLayout>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
