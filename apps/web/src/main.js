import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { queryClient } from "./lib/query";
import { AuthProvider } from "./hooks/use-auth";
import { ThemeProvider } from "./components/theme-provider";
import App from "./App";
import "@workspace/ui/globals.css";
createRoot(document.getElementById("root")).render(<StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider defaultTheme="system" storageKey="expense-theme">
          <AuthProvider>
            <App />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>);
