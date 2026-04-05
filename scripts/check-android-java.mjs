import { spawnSync } from "node:child_process";

function getJavaInfo() {
  const result = spawnSync("java", ["-version"], { encoding: "utf8" });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();

  if (result.error) {
    return {
      ok: false,
      reason: `Could not run 'java -version': ${result.error.message}`,
      output,
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      reason: `'java -version' exited with code ${result.status}.`,
      output,
    };
  }

  const match = output.match(/version "(\d+)(?:[.\w+-]*)"/i);
  if (!match) {
    return {
      ok: false,
      reason: "Could not detect the installed Java major version.",
      output,
    };
  }

  return {
    ok: true,
    major: Number(match[1]),
    output,
  };
}

const javaInfo = getJavaInfo();
if (!javaInfo.ok) {
  console.error("Android build preflight failed.");
  console.error(javaInfo.reason);
  if (javaInfo.output) {
    console.error(javaInfo.output);
  }
  process.exit(1);
}

const javaHome = process.env.JAVA_HOME || "(not set)";
const supportedRange = "21 through 25";

if (javaInfo.major < 21 || javaInfo.major > 25) {
  console.error(
    `Android build requires a Gradle-compatible JDK in the ${supportedRange} range.`,
  );
  console.error(
    `Detected Java ${javaInfo.major}${process.env.JAVA_HOME ? ` at ${javaHome}` : ""}.`,
  );
  console.error(
    "The current Android Gradle toolchain in this repo does not support running on Java 26.",
  );
  console.error(
    "Install JDK 21 or JDK 25, set JAVA_HOME to that installation, then rerun the Android command.",
  );
  process.exit(1);
}

console.log(`Android Java preflight passed with Java ${javaInfo.major}.`);
