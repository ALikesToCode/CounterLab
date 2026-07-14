import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/instrument-sans/index.css";
import "@fontsource-variable/newsreader/index.css";

import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("CounterLab root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
