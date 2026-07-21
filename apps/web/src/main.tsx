import "./zodBrowserConfig";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/instrument-sans/index.css";

import { App } from "./App";
import "./styles.css";
import "./styles/studio.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("CounterLab root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
