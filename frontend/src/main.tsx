import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import DemoApp from "./DemoApp";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import { ThemeProvider } from "./context/ThemeContext";
import "./styles/index.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);
if (import.meta.env.VITE_DEMO_MODE === "true") {
  root.render(<React.StrictMode><DemoApp /></React.StrictMode>);
} else {
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <LanguageProvider>
            <ThemeProvider><App /></ThemeProvider>
          </LanguageProvider>
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}
