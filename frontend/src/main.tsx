import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { ToastProvider } from "./components/ui";
import { I18nProvider } from "./lib/i18n";
import "@fontsource-variable/inter/index.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/theme.css";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <I18nProvider>
        <ToastProvider>
        <App />
      </ToastProvider>
      </I18nProvider>
    </HashRouter>
  </React.StrictMode>
);
