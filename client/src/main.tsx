import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// fonts are bundled (portals block third-party requests such as Google Fonts)
import "@fontsource/baloo-2/latin-600.css";
import "@fontsource/baloo-2/latin-800.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-700.css";
import { wakeServer } from "./net/transport.ts";
import { App } from "./ui/App.tsx";
import "./styles.css";

wakeServer();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
