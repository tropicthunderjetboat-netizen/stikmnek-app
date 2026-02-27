import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AppProvider } from "@/contexts/AppContext";
import React, { Suspense } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const DiagnosticPanel = React.lazy(() => import("./components/DiagnosticPanel"));
const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <ThemeProvider defaultTheme="light">
      <QueryClientProvider client={queryClient}>
        <AppProvider> 
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route
                  path="/diagnostics"
                  element={
                    <Suspense fallback={<div className="p-10 text-center">Loading...</div>}>
                      <DiagnosticPanel />
                    </Suspense>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </AppProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
