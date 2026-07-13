import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configureAndroidVersion,
  validateVersionCode,
  validateVersionName,
} from "./prompt-android-version.mjs";

const tempRoots = [];

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "tasklaunch-android-version-"));
  tempRoots.push(root);
  await mkdir(path.join(root, "android", "app"), { recursive: true });
  await writeFile(path.join(root, "package.json"), '{\n  "name": "fixture",\n  "version": "1.3.6"\n}\n');
  await writeFile(
    path.join(root, "package-lock.json"),
    '{\n  "name": "fixture",\n  "version": "1.3.6",\n  "packages": {\n    "": {\n      "name": "fixture",\n      "version": "1.3.6"\n    }\n  }\n}\n',
  );
  await writeFile(
    path.join(root, "android", "app", "build.gradle"),
    'android {\n    defaultConfig {\n        versionCode 36\n        versionName "1.3.6"\n    }\n}\n',
  );
  return root;
}

async function snapshot(root) {
  return Promise.all([
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "package-lock.json"), "utf8"),
    readFile(path.join(root, "android", "app", "build.gradle"), "utf8"),
  ]);
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Android version validation", () => {
  it.each(["0", "-1", "1.5", "abc", String(Number.MAX_SAFE_INTEGER + 1)])(
    "rejects invalid version code %s",
    (value) => expect(validateVersionCode(value, 36)).toHaveProperty("error"),
  );

  it("rejects a lower version code and accepts the current or a higher code", () => {
    expect(validateVersionCode("35", 36)).toHaveProperty("error");
    expect(validateVersionCode("36", 36)).toEqual({ value: 36 });
    expect(validateVersionCode("37", 36)).toEqual({ value: 37 });
  });

  it.each(["1", "1.2", "01.2.3", "1.2.3-01", "v1.2.3", ""])(
    "rejects invalid semantic version %s",
    (value) => expect(validateVersionName(value)).toHaveProperty("error"),
  );

  it.each(["1.3.7", "2.0.0-beta.1", "2.0.0+build.4"])("accepts semantic version %s", (value) => {
    expect(validateVersionName(value)).toEqual({ value });
  });
});

describe("interactive Android version configuration", () => {
  it("accepts current defaults and keeps all metadata consistent", async () => {
    const root = await createFixture();
    const prompt = vi.fn(async () => "");
    const result = await configureAndroidVersion({ root, isInteractive: true, prompt, log: vi.fn() });
    expect(result).toEqual({ versionCode: 36, versionName: "1.3.6" });
    expect(prompt.mock.calls.map(([message]) => message)).toEqual([
      "Android version code [36]: ",
      "Version name [1.3.6]: ",
    ]);
    expect(JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version).toBe("1.3.6");
  });

  it("re-prompts invalid values and updates every metadata location", async () => {
    const root = await createFixture();
    const answers = ["35", "37", "bad", "1.4.0"];
    await configureAndroidVersion({ root, isInteractive: true, prompt: vi.fn(async () => answers.shift()), log: vi.fn() });

    const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    const packageLock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
    const gradle = await readFile(path.join(root, "android", "app", "build.gradle"), "utf8");
    expect(packageJson.version).toBe("1.4.0");
    expect(packageLock.version).toBe("1.4.0");
    expect(packageLock.packages[""].version).toBe("1.4.0");
    expect(gradle).toContain("versionCode 37");
    expect(gradle).toContain('versionName "1.4.0"');
  });

  it("does not touch files when prompting is cancelled", async () => {
    const root = await createFixture();
    const before = await snapshot(root);
    const prompt = vi.fn().mockResolvedValueOnce("37").mockRejectedValueOnce(new Error("cancelled"));
    await expect(configureAndroidVersion({ root, isInteractive: true, prompt, log: vi.fn() })).rejects.toThrow("cancelled");
    expect(await snapshot(root)).toEqual(before);
  });

  it("fails without a TTY before reading or writing metadata", async () => {
    const missingRoot = path.join(os.tmpdir(), `missing-android-version-${Date.now()}`);
    await expect(configureAndroidVersion({ root: missingRoot, isInteractive: false, prompt: vi.fn() })).rejects.toThrow(
      "interactive terminal is required",
    );
  });
});
