import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Android and synced web assets:
    "android/**/build/**",
    "android/app/src/main/assets/public/**",
    // Local scratch/debug scripts:
    "__*.js",
    "tmp_*.js",
    "apk_check_*/**",
  ]),
]);

export default eslintConfig;
