import { createApp, type App as VueApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { initFreelogApp } from "freelog-runtime";

let app: VueApp | null = null;

window.mount = () => {
  initFreelogApp();
  app = createApp(App);
  app.mount("#app");
};

window.unmount = () => {
  app?.unmount();
  app = null;
};
