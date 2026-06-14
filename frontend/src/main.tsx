import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AdminFeedbackDashboard } from "./pages/AdminFeedbackDashboard";
import { applyTheme } from "./hooks/useTheme";
import "./index.css";

const saved = localStorage.getItem("tradescharge-theme");
applyTheme(saved === "light" ? "light" : "dark");

const isAdminRoute =
  window.location.pathname === "/admin" || window.location.pathname === "/admin/";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isAdminRoute ? <AdminFeedbackDashboard /> : <App />}</StrictMode>,
);