import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
  // The shared package ships TypeScript source, so it is bundled in.
  noExternal: ["@retro/shared"],
  clean: true,
});
