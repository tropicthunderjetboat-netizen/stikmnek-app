
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/components/theme-provider";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AppProvider } from "@/contexts/AppContext";
import AppLayout from "@/components/AppLayout";
import React, { Suspense } from "react";
import ResetPassword from "./pages/ResetPassword";
import ListBusiness from "./pages/ListBusiness";

const DiagnosticPanel = React.lazy(() => import("./components/DiagnosticPanel"));

const queryClient = new QueryClient();

/** Keeps auth + view state alive across footer / nav route changes. */
const AppProviderLayout = () => (
  <AppProvider>
    <Outlet />
  </AppProvider>
);

const App = () => (
  <ErrorBoundary>
    <HelmetProvider>
    <ThemeProvider defaultTheme="light">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/diagnostics"
                element={
                  <AppProvider>
                    <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Loading diagnostics...</div>}>
                      <DiagnosticPanel />
                    </Suspense>
                  </AppProvider>
                }
              />
              <Route element={<AppProviderLayout />}>
                <Route path="/list-your-business" element={<ListBusiness />} />
                <Route path="/for-business" element={<Navigate to="/list-your-business" replace />} />
                <Route path="/*" element={<AppLayout />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
    </HelmetProvider>
  </ErrorBoundary>
);

export default App;

