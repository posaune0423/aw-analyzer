import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreExportsUsedInFile: {
    interface: true,
    type: true,
  },
  tags: ["-lintignore"],

  // Restrict analysis scope to avoid noise from tests which are often not imported.
  project: ["src/**/*.{ts,tsx,js,jsx}", "scripts/**/*.{ts,tsx,js,jsx}", "index.ts"],
  ignore: ["tests/**", "**/*.test.*", "**/__tests__/**"],
};

export default config;
