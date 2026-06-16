// main.jsx — app entry point (Tier 2: cloud sync)
// AuthGate handles sign-in, installs the Supabase-backed window.storage,
// and only then mounts the BakeLab app.
import React from "react";
import { createRoot } from "react-dom/client";
import AuthGate from "./AuthGate.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>
);
