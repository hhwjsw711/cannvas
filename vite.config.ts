import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Chromium 112（TX2 kiosk）存在动态 <link rel="stylesheet"> 的 load 事件
 * 永远不触发的 bug。Vite 的 preload 辅助函数会等待该事件后才执行
 * import(主模块)，导致页面永远白屏。
 *
 * 修复：构建完成后把 kioskMain 的 CSS link 直接写入 dist/index.html。
 * preload 辅助函数发现 HTML 中已存在相同 href 的 stylesheet link 时
 * 会跳过等待，直接执行 import，React 得以挂载。
 */
function injectKioskCss(): Plugin {
  return {
    name: "inject-kiosk-css-for-chromium112",
    closeBundle() {
      const distDir = resolve(import.meta.dirname, "dist");
      const assetsDir = resolve(distDir, "assets");
      if (!existsSync(assetsDir)) return;
      const kioskCss = readdirSync(assetsDir).find(
        (file) => file.startsWith("kioskMain-") && file.endsWith(".css"),
      );
      if (!kioskCss) return;
      const htmlPath = resolve(distDir, "index.html");
      if (!existsSync(htmlPath)) return;
      const html = readFileSync(htmlPath, "utf-8");
      if (html.includes(`/assets/${kioskCss}`)) return;
      writeFileSync(htmlPath, html.replace(
        "</head>",
        `  <link rel="stylesheet" crossorigin href="/assets/${kioskCss}">\n  </head>`,
      ));
    },
  };
}

export default defineConfig({
  plugins: [react(), injectKioskCss()],
  server: {
    host: "0.0.0.0",
  },
  build: {
    rollupOptions: {
      input: {
        cannvas: resolve(import.meta.dirname, "index.html"),
        apps: resolve(import.meta.dirname, "apps/index.html"),
        giveaway: resolve(import.meta.dirname, "giveaway/index.html"),
        inventory: resolve(import.meta.dirname, "inventory/index.html"),
      },
    },
  },
});
