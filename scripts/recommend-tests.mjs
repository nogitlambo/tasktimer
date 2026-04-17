import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const PLAYWRIGHT_AUTH_STATE_PATH = path.join(process.cwd(), "tests", "e2e", ".auth", "user.json");

function normalizePath(value) {
  return String(value || "").trim().replace(/\\/g, "/");
}

function unique(values) {
  return [...new Set(values)];
}

function getChangedPathsFromGit() {
  const gitCheck = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (gitCheck.status !== 0) return [];

  const result = spawnSync("git", ["diff", "--name-only", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return [];

  return result.stdout
    .split(/\r?\n/)
    .map(normalizePath)
    .filter(Boolean);
}

function getChangedPaths() {
  const args = process.argv.slice(2).map(normalizePath).filter(Boolean);
  if (args.length) return unique(args);
  return unique(getChangedPathsFromGit());
}

function createRecommendation() {
  return {
    commands: new Set(),
    reasons: new Set(),
    unitScopes: new Set(),
  };
}

function addCommand(target, command, reason) {
  target.commands.add(command);
  if (reason) target.reasons.add(reason);
}

function addUnitScope(target, scope, reason) {
  target.unitScopes.add(scope);
  if (reason) target.reasons.add(reason);
}

function finalizeUnitRecommendations(target) {
  const scopes = [...target.unitScopes];
  if (!scopes.length) return;

  if (scopes.length >= 3 || scopes.includes("full")) {
    target.commands.add("npm run test:unit");
    return;
  }

  const scopeToCommand = {
    runtime: "npm run test:unit:runtime",
    schedule: "npm run test:unit:schedule",
    history: "npm run test:unit:history",
    archie: "npm run test:unit:archie",
    rewards: "npm run test:unit:rewards",
    subscriptions: "npm run test:unit:subscriptions",
  };

  scopes.forEach((scope) => {
    const command = scopeToCommand[scope];
    if (command) target.commands.add(command);
    else target.commands.add("npm run test:unit");
  });
}

function recommendForPath(filePath, target) {
  const path = normalizePath(filePath).toLowerCase();

  const isTaskTimerSourceCode =
    path.startsWith("src/app/tasktimer/") && (path.endsWith(".ts") || path.endsWith(".tsx"));
  const isTaskRuntime =
    path.includes("src/app/tasktimer/client/") ||
    path.endsWith("/src/app/tasktimer/tasktimerclient.ts") ||
    path.endsWith("src/app/tasktimer/tasktimerclient.ts");
  const isAppShell =
    path.includes("src/app/tasktimer/client/app-shell") ||
    path.includes("src/app/tasktimer/tasktimermainappclient") ||
    path.includes("src/app/tasktimer/components/desktopapprail") ||
    path.includes("src/app/tasktimer/client/root-runtime") ||
    path.includes("src/app/tasktimer/client/global-events");
  const isSchedule =
    path.includes("schedule-runtime") ||
    path.includes("schedule-render") ||
    path.includes("schedulepagecontent") ||
    path.includes("/src/app/tasktimer/components/schedule") ||
    path.includes("/src/app/tasktimer/lib/schedule");
  const isTasksRoute =
    path.startsWith("src/app/tasklaunch/") ||
    path.includes("src/app/tasktimer/components/addtask") ||
    path.includes("src/app/tasktimer/components/edittask") ||
    path.includes("src/app/tasktimer/components/focusmodescreen") ||
    path.includes("src/app/tasktimer/components/historyscreen") ||
    path.includes("src/app/tasktimer/client/add-task") ||
    path.includes("src/app/tasktimer/client/edit-task") ||
    path.includes("src/app/tasktimer/client/session") ||
    path.includes("src/app/tasktimer/client/tasks");
  const isDashboardRoute =
    path.startsWith("src/app/dashboard/") ||
    path.includes("dashboardpagecontent") ||
    path.includes("src/app/tasktimer/client/dashboard");
  const isFriendsRoute =
    path.startsWith("src/app/friends/") ||
    path.includes("friendsoverlays") ||
    path.includes("src/app/tasktimer/client/groups") ||
    path.includes("src/app/tasktimer/lib/friendsstore");
  const isSettingsRoute =
    path.startsWith("src/app/settings/") ||
    path.includes("src/app/tasktimer/components/settings/") ||
    path.includes("src/app/tasktimer/components/settingspanel") ||
    path.includes("src/app/tasktimer/components/settingsscreen");
  const isHistoryManagerRoute =
    path.startsWith("src/app/history-manager/") ||
    path.includes("historymanagerscreen") ||
    path.includes("history-manager");
  const isFeedbackRoute =
    path.startsWith("src/app/feedback/") ||
    path.includes("feedbackscreen") ||
    path.includes("feedbackstore") ||
    path.includes("feedbackstatus");
  const isUserGuideRoute =
    path.startsWith("src/app/user-guide/") ||
    path.includes("userguidescreen");
  const isTaskComponent = path.includes("src/app/tasktimer/components/");
  const isLandingOrSignIn =
    path === "src/app/page.tsx" ||
    path.startsWith("src/app/web-sign-in/") ||
    path === "src/app/websign-in.tsx" ||
    path.endsWith("/src/app/websign-in.tsx") ||
    path.includes("src/app/landing");
  const isApiOrServer =
    path.startsWith("src/app/api/") ||
    path.startsWith("src/lib/") ||
    path.includes("firebaseadmin") ||
    path.includes("subscriptions");
  const isCss =
    path.endsWith(".css") ||
    path.includes("tasktimer.css") ||
    path.includes("/styles/");
  const isAuthPersistence =
    path.includes("firebaseclient") ||
    path.includes("tasklaunchauthguard") ||
    path.includes("settingsaccountservice") ||
    path.includes("web-sign-in") ||
    path === "src/app/page.tsx";
  const isMobileSensitive =
    isSchedule ||
    path.includes("touch") ||
    path.includes("mobile") ||
    path.includes("footer") ||
    path.includes("overlay");
  const isPureTestFile = path.startsWith("tests/");

  if (isPureTestFile) {
    addUnitScope(target, "full", `${filePath}: test file changed; keep a fast baseline.`);
  }

  if (isTaskRuntime || isTaskTimerSourceCode) {
    addUnitScope(target, "runtime", `${filePath}: TaskTimer runtime/client logic changed.`);
  }

  if (isSchedule) {
    addUnitScope(target, "schedule", `${filePath}: schedule logic changed.`);
    addCommand(target, "npm run test:e2e:mobile", `${filePath}: mobile schedule regression coverage is relevant.`);
    addCommand(target, "npm run test:e2e:auth", `${filePath}: desktop authenticated schedule/task flow may regress.`);
  }

  if (isTasksRoute) {
    addCommand(target, "npm run test:e2e:auth", `${filePath}: tasks route flow may regress.`);
  }

  if (isDashboardRoute) {
    addCommand(target, "npm run test:e2e:auth", `${filePath}: dashboard route flow may regress.`);
  }

  if (isFriendsRoute) {
    addCommand(target, "npm run test:e2e:auth", `${filePath}: friends route flow may regress.`);
  }

  if (isSettingsRoute) {
    addCommand(target, "npm run test:e2e:auth", `${filePath}: settings route flow may regress.`);
  }

  if (isFeedbackRoute) {
    addCommand(target, "npm run test:e2e:auth", `${filePath}: feedback route flow may regress.`);
  }

  if (isHistoryManagerRoute) {
    addCommand(target, "npm run test:e2e:auth", `${filePath}: history manager route flow may regress.`);
  }

  if (isUserGuideRoute) {
    addCommand(target, "npm run test:e2e:auth", `${filePath}: user guide route flow may regress.`);
  }

  if (isLandingOrSignIn) {
    addCommand(target, "npm run test:e2e", `${filePath}: public landing/sign-in flow changed.`);
  }

  if (isAppShell) {
    addCommand(target, "npm run test:e2e:auth", `${filePath}: authenticated navigation shell changed.`);
    addCommand(target, "npm run test:e2e:mobile", `${filePath}: mobile navigation shell changed.`);
  }

  if (isCss) {
    addUnitScope(target, "full", `${filePath}: CSS touched; keep a fast baseline check.`);
    if (isMobileSensitive || path.includes("schedule")) {
      addCommand(target, "npm run test:e2e:mobile", `${filePath}: responsive/touch styling can affect mobile flows.`);
    }
    if (path.includes("settings") || path.includes("feedback") || path.includes("user-guide") || path.includes("history-manager")) {
      addCommand(target, "npm run test:e2e:auth", `${filePath}: route styling can affect authenticated UI behavior.`);
    }
    if (path.includes("friends") || path.includes("dashboard") || path.includes("tasklaunch") || path.includes("tasktimer")) {
      addCommand(target, "npm run test:e2e:auth", `${filePath}: core app styling can affect authenticated flows.`);
    }
    if (path.includes("landing") || path.includes("web-sign-in") || path === "src/app/globals.css") {
      addCommand(target, "npm run test:e2e", `${filePath}: public entrypoint styling can affect landing/sign-in flows.`);
    }
  }

  if (isApiOrServer) {
    if (path.includes("src/app/api/archie/")) {
      addUnitScope(target, "archie", `${filePath}: Archie API logic changed.`);
    } else if (path.includes("subscriptionstore")) {
      addUnitScope(target, "subscriptions", `${filePath}: subscription persistence logic changed.`);
    } else {
      addUnitScope(target, "full", `${filePath}: server/data logic changed.`);
    }
  }

  if (isAuthPersistence) {
    addCommand(target, "npm run test:e2e", `${filePath}: public auth entry flow changed.`);
    addCommand(target, "npm run test:e2e:auth", `${filePath}: authenticated session flow changed.`);
  }

  if (isMobileSensitive && !isSchedule) {
    addCommand(target, "npm run test:e2e:mobile", `${filePath}: mobile/touch/navigation flow changed.`);
  }

  if (path.includes("archieassistantwidget") || path.includes("archieengine") || path.includes("src/app/api/archie/")) {
    addUnitScope(target, "archie", `${filePath}: Archie assistant logic changed.`);
  }

  if (
    path.includes("history-manager") ||
    path.includes("historymanagerscreen") ||
    path.includes("history-manager-generation") ||
    path.includes("history-manager-shared")
  ) {
    addUnitScope(target, "history", `${filePath}: history manager logic changed.`);
  }

  if (
    path.includes("rewards") ||
    path.includes("focusinsights") ||
    path.includes("preferencesservice") ||
    path.includes("pending-sync") ||
    path.includes("completiondifficulty")
  ) {
    addUnitScope(target, "rewards", `${filePath}: rewards/preferences insight logic changed.`);
  }

  if (path.includes("subscriptionstore")) {
    addUnitScope(target, "subscriptions", `${filePath}: subscription store logic changed.`);
  }
}

function printRecommendations(paths, recommendation) {
  if (!paths.length) {
    console.log("No changed files detected.");
    console.log("Usage:");
    console.log("  node scripts/recommend-tests.mjs <file1> <file2> ...");
    console.log("Or run it inside a git worktree with git available so it can inspect `git diff --name-only HEAD`.");
    process.exit(0);
  }

  console.log("Changed files:");
  paths.forEach((path) => console.log(`- ${path}`));
  console.log("");

  const commands = [...recommendation.commands];
  if (!commands.length) {
    console.log("No specific test recommendation rule matched these paths.");
    console.log("Safe default:");
    console.log("- npm run test:unit");
    process.exit(0);
  }

  console.log("Recommended commands:");
  commands.forEach((command) => console.log(`- ${command}`));
  if (recommendation.commands.has("npm run test:e2e:auth") || recommendation.commands.has("npm run test:e2e:mobile")) {
    if (!existsSync(PLAYWRIGHT_AUTH_STATE_PATH)) {
      console.log("- npm run test:e2e:auth:setup");
    }
  }
  console.log("");
  console.log("Why:");
  [...recommendation.reasons].forEach((reason) => console.log(`- ${reason}`));
  if ((recommendation.commands.has("npm run test:e2e:auth") || recommendation.commands.has("npm run test:e2e:mobile")) && !existsSync(PLAYWRIGHT_AUTH_STATE_PATH)) {
    console.log(`- Playwright auth state is missing at ${normalizePath(PLAYWRIGHT_AUTH_STATE_PATH)}.`);
  }
}

const changedPaths = getChangedPaths();
const recommendation = createRecommendation();

for (const filePath of changedPaths) {
  recommendForPath(filePath, recommendation);
}

finalizeUnitRecommendations(recommendation);

printRecommendations(changedPaths, recommendation);
