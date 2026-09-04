import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Pruebas de componente del frontend.
 *
 * Entorno DOM real (jsdom) a propósito: lo que se verifica es qué QUEDA
 * RENDERIZADO. Una aserción sobre la lógica en abstracto no habría detectado
 * nada del problema que motivó estas pruebas — el botón de rectificar estaba
 * bien condicionado y aun así no se veía.
 *
 * `.mts` y no `.ts`: el paquete no declara `"type": "module"`, y con extensión
 * `.ts` Vite carga esta configuración como CommonJS.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
  },
});
