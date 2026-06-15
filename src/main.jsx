// main.jsx — app entry point
// The storage shim is imported FIRST (before the component) so window.storage
// exists by the time BakeLab's boot effect runs.
import "./storage-shim.js";

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./BakeLab.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
