import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "@fontsource-variable/geist";
import "./styles/main.css";

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
