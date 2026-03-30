import { Switch, Route } from "wouter";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { Sidebar } from "@/components/layout/sidebar";
import { Toaster } from "@/components/ui/toaster";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import EmployeesPage from "@/pages/employees";
import TimesheetsPage from "@/pages/timesheets";
import PayrollPage from "@/pages/payroll";
import RoutesPage from "@/pages/routes";
import JobCostingPage from "@/pages/job-costing";
import AnalyticsPage from "@/pages/analytics";

function AppLayout() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 ml-60 min-h-screen">
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/employees" component={EmployeesPage} />
          <Route path="/timesheets" component={TimesheetsPage} />
          <Route path="/routes" component={RoutesPage} />
          <Route path="/payroll" component={PayrollPage} />
          <Route path="/job-costing" component={JobCostingPage} />
          <Route path="/analytics" component={AnalyticsPage} />
          <Route>
            <div className="p-6">
              <h1 className="text-2xl font-semibold text-gray-900">Page Not Found</h1>
            </div>
          </Route>
        </Switch>
      </main>
    </div>
  );
}

function AuthGate() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <LoginPage />;
  return <AppLayout />;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
      <Toaster />
    </AuthProvider>
  );
}
