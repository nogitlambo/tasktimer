import { existsSync } from "node:fs";
import path from "node:path";

export const AUTH_STATE_PATH = path.join(process.cwd(), "tests", "e2e", ".auth", "user.json");

export function hasAuthState() {
  return existsSync(AUTH_STATE_PATH);
}
