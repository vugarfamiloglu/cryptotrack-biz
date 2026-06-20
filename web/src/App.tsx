import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "./providers/theme";
import { ToastProvider } from "./providers/toast";
import { DialogProvider } from "./providers/dialogs";
import { AuthProvider, useAuth } from "./providers/auth";
import { LiveProvider } from "./providers/live";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/ui";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Portfolios } from "./pages/Portfolios";
import { PortfolioDetail } from "./pages/PortfolioDetail";
import { Transactions } from "./pages/Transactions";
import { Alerts } from "./pages/Alerts";
import { Assets } from "./pages/Assets";
import { Reports } from "./pages/Reports";
import { Audit } from "./pages/Audit";
import { Logs } from "./pages/Logs";
import { Settings } from "./pages/Settings";

function Gate({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div style={{ height: "100vh", display: "grid", placeItems: "center" }}><Spinner /></div>;
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <DialogProvider>
          <AuthProvider>
            <LiveProvider>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<Gate><AppShell /></Gate>}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/portfolios" element={<Portfolios />} />
                  <Route path="/portfolios/:id" element={<PortfolioDetail />} />
                  <Route path="/transactions" element={<Transactions />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/assets" element={<Assets />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/audit" element={<Audit />} />
                  <Route path="/logs" element={<Logs />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </LiveProvider>
          </AuthProvider>
        </DialogProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
