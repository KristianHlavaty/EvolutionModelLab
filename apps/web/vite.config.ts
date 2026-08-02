import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const serverPort = Number(env.SERVER_PORT || process.env.SERVER_PORT || 3001);
  const webPort = Number(env.WEB_PORT || process.env.WEB_PORT || 5173);

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: webPort,
      strictPort: true,
      proxy: {
        "/api": `http://127.0.0.1:${serverPort}`,
      },
    },
  };
});
