import { configDefaults, defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    // .worktrees/ contains git worktrees that hold their own copies of these
    // specs plus their own node_modules. A root-anchored "node_modules/**"
    // does not match those, so `npm test` at the repo root collected them and
    // reported other worktrees' failures as its own.
    exclude: [...configDefaults.exclude, "e2e/**", ".worktrees/**"],
  },
});