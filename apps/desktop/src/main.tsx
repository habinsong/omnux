import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import ShellErrorBoundary from "./ShellErrorBoundary";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ShellErrorBoundary>
      <App />
    </ShellErrorBoundary>
  </React.StrictMode>,
);
