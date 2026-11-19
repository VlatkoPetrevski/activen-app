import "@fontsource-variable/inter";
import "@fontsource-variable/nunito";
import "./styles/app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DemoApi } from "./api/demo.js";
import { HttpApi } from "./api/http.js";
import { App } from "./app/App.js";

const demo = import.meta.env.VITE_DEMO === "true";
const currentLocale = () => (document.documentElement.lang === "en" ? "en" : "mk");
const api = demo ? new DemoApi(currentLocale) : new HttpApi(import.meta.env.VITE_API_URL ?? "");

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <App api={api} hashRouting={demo} />
    </StrictMode>,
  );
