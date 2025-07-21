import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initFreelogApp } from "freelog-runtime-v2";
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

window.mount = () => {
  initFreelogApp();
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

window.unmount = () => {
  root.unmount();
};
