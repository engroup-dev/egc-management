import { useState, useEffect } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Dashboard from "./dashboard/dashboard";
import LoginForm from "./auth/LoginForm";
import MainMenu from "../pages/MainMenu";
import ProfilePage from "../pages/profile/profile";
import MainMenuLayout from "./layouts/MainMenuLayout";
import { AuthProvider, useAuth } from "../hooks/useAuth";
import { QueryPersistenceGate } from "./providers/QueryPersistenceGate";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import RequirePasswordChange from "./auth/RequirePasswordChange";
import ChangePasswordPage from "./auth/ChangePasswordPage";
import HRRoutes from "./pages/HRRoutes";
import CRMRoutes from "./pages/CRMRoutes";
import SupplyChainRoutes from "./pages/SupplyChainRoutes";
import ProjectsRoutes from "./pages/ProjectsRoutes";
import FinanceRoutes from "./pages/FinanceRoutes";
import SettingsRoutes from "./pages/SettingsRoutes";
import CompanyRoutes from "./pages/CompanyRoutes";
import OperationsRoutes from "./pages/OperationsRoutes";
import { SidebarProvider } from "../contexts/SidebarContext";
import { UpdateProvider } from "../contexts/Updateprovider";
import ShopsRoutes from "./pages/ShopsRoutes";
import ExecutionManagementRoutes from "./pages/ExecutionManagementRoutes";
import TasksRoutes from "./pages/TasksRoutes";
import RequirePermission from "./auth/RequirePermission";
import NotificationsPage from "../pages/notifications/NotificationsPage";
import NotificationSettingsPage from "../pages/profile/NotificationSettingsPage";

const AppRouter = () => {
  const [session, setSession] = useState(false);
  const { refreshUser } = useAuth();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(!!session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(!!session);
      },
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return; // Only refresh when logged in

    const interval = setInterval(
      async () => {
        console.log("🔄 Auto-refreshing user data...");
        try {
          await refreshUser();
          console.log("✅ User data refreshed successfully");
        } catch (error) {
          console.error("Final refresh failure:", error);
        }
      },
      5 * 60 * 1000,
    ); // 5 minutes = 10 minutes * 60 seconds * 1000 milliseconds

    return () => clearInterval(interval);
  }, [session, refreshUser]);

  // Optional: Also refresh when user returns to the tab
  useEffect(() => {
    if (!session) return;

    let lastRefresh = Date.now();

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        const timeSinceLastRefresh = Date.now() - lastRefresh;
        const fifteenMinutes = 5 * 60 * 1000;

        // Only refresh if it's been more than 5 minutes
        if (timeSinceLastRefresh > fifteenMinutes) {
          console.log("👀 User returned, refreshing data...");
          await refreshUser();
          lastRefresh = Date.now();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [session, refreshUser]);

  return (
    <Routes>
      {/* Public route */}
      <Route path="/login" element={<LoginForm />} />

      {/* Protected routes with Layout wrapper */}
      {session && (
        <Route element={<RequirePasswordChange />}>
          <Route element={<MainMenuLayout />}>
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="/" element={<MainMenu />} />
            <Route path="/dashboard" element={<Dashboard />} />

            {/* HR */}
            <Route element={<RequirePermission permission="view_hr_section" />}>
              <Route path="/hr/*" element={<HRRoutes />} />
            </Route>

            {/* CRM */}
            <Route path="/crm/*" element={<CRMRoutes />} />

            {/* Supply Chain */}
            <Route path="/supply-chain/*" element={<SupplyChainRoutes />} />

            {/* Projects */}
            <Route path="/projects/*" element={<ProjectsRoutes />} />

            {/* Finance */}
            <Route
              element={<RequirePermission permission="view_finance_section" />}
            >
              <Route path="/finance/*" element={<FinanceRoutes />} />
            </Route>

            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/notifications" element={<NotificationSettingsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />

            {/* Settings */}
            <Route
              element={<RequirePermission permission="view_settings_section" />}
            >
              <Route path="/settings/*" element={<SettingsRoutes />} />
            </Route>

            {/* operations */}
            <Route
              element={
                <RequirePermission permission="view_operations_section" />
              }
            >
              <Route path="/operations/*" element={<OperationsRoutes />} />
            </Route>

            <Route
              element={<RequirePermission permission="view_shops_section" />}
            >
              <Route path="/shops/*" element={<ShopsRoutes />} />
            </Route>

            <Route
              element={<RequirePermission permission="view_company_section" />}
            >
              <Route path="/company/*" element={<CompanyRoutes />} />
            </Route>
            <Route
              element={
                <RequirePermission permission="view_execution_section" />
              }
            >
              <Route
                path="/execution-management/*"
                element={<ExecutionManagementRoutes />}
              />
            </Route>

            {/* Tasks — section-level gate only (view_tasks_section,
                granted to Admin only while the module is in testing).
                Per-screen/action permissions inside it are still on hold,
                see TasksRoutes.tsx and task-module-build-plan.md Part 12. */}
            <Route
              element={<RequirePermission permission="view_tasks_section" />}
            >
              <Route path="/tasks/*" element={<TasksRoutes />} />
            </Route>
          </Route>
        </Route>
      )}

      {/* If not logged in, fallback to login */}
      {!session && <Route path="*" element={<LoginForm />} />}
    </Routes>
  );
};

const App = () => (
  <Router>
    <AuthProvider>
      <QueryPersistenceGate />
      <UpdateProvider>
        <SidebarProvider>
          <AppRouter />
        </SidebarProvider>
      </UpdateProvider>
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </AuthProvider>
  </Router>
);

export default App;
