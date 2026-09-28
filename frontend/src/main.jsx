import "./instrument.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Sentry } from "./instrument.js";
import App from "./App.jsx";
import "./styles.css";

function ErrorFallback() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-white p-6 text-center shadow-floating">
      <p className="text-sm text-gray-600">
        Une erreur inattendue est survenue. Rechargez la page ; si ça persiste, contactez-nous.
      </p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
