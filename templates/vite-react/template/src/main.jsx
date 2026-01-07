import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { initFreelogApp } from "freelog-runtime";

const root = createRoot(document.getElementById("root"));

window.mount = () => {
  initFreelogApp();
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
};

window.unmount = () => {
  root.unmount();
};
