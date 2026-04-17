"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";

type IndexedDbRecord = {
  key?: unknown;
  value?: unknown;
};

type IndexedDbIndex = {
  name: string;
  keyPath?: string;
  keyPathArray?: string[];
  multiEntry: boolean;
  unique: boolean;
};

type IndexedDbStore = {
  name: string;
  records: IndexedDbRecord[];
  indexes: IndexedDbIndex[];
  autoIncrement: boolean;
  keyPath?: string;
  keyPathArray?: string[];
};

type IndexedDbDatabaseDump = {
  name: string;
  version: number;
  stores: IndexedDbStore[];
};

type PlaywrightOriginStateDump = {
  origin: string;
  localStorage: Array<{ name: string; value: string }>;
  indexedDB: IndexedDbDatabaseDump[];
};

type PlaywrightStorageStateDump = {
  cookies: [];
  origins: PlaywrightOriginStateDump[];
};

function idbRequestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function collectIndexedDbDump(): Promise<IndexedDbDatabaseDump[]> {
  const indexedDbWithDatabases = window.indexedDB as IDBFactory & {
    databases?: () => Promise<Array<{ name?: string; version?: number }>>;
  };
  if (typeof window === "undefined" || !indexedDbWithDatabases.databases) return [];
  const databases = await indexedDbWithDatabases.databases();
  const dumps: IndexedDbDatabaseDump[] = [];

  for (const dbInfo of databases) {
    if (!dbInfo.name || !dbInfo.version) continue;
    const db = await idbRequestToPromise(window.indexedDB.open(dbInfo.name));
    const storeNames = Array.from(db.objectStoreNames);
    if (!storeNames.length) {
      dumps.push({ name: dbInfo.name, version: dbInfo.version, stores: [] });
      db.close();
      continue;
    }

    const transaction = db.transaction(storeNames, "readonly");
    const stores = await Promise.all(
      storeNames.map(async (storeName) => {
        const objectStore = transaction.objectStore(storeName);
        const keys = await idbRequestToPromise(objectStore.getAllKeys());
        const values = await idbRequestToPromise(objectStore.getAll());
        const usesInlineKeys = objectStore.keyPath !== null;
        const records = keys.map((key, index) =>
          usesInlineKeys
            ? {
                value: values[index],
              }
            : {
                key,
                value: values[index],
              }
        );
        const indexes = Array.from(objectStore.indexNames).map((indexName) => {
          const index = objectStore.index(indexName);
          return {
            name: index.name,
            keyPath: typeof index.keyPath === "string" ? index.keyPath : undefined,
            keyPathArray: Array.isArray(index.keyPath) ? index.keyPath.map(String) : undefined,
            multiEntry: index.multiEntry,
            unique: index.unique,
          };
        });
        return {
          name: storeName,
          records,
          indexes,
          autoIncrement: objectStore.autoIncrement,
          keyPath: typeof objectStore.keyPath === "string" ? objectStore.keyPath : undefined,
          keyPathArray: Array.isArray(objectStore.keyPath) ? objectStore.keyPath.map(String) : undefined,
        };
      })
    );

    dumps.push({
      name: dbInfo.name,
      version: dbInfo.version,
      stores,
    });
    db.close();
  }

  return dumps;
}

async function buildPlaywrightStorageDump(): Promise<PlaywrightStorageStateDump> {
  const localStorageDump = Object.keys(window.localStorage).map((name) => ({
    name,
    value: String(window.localStorage.getItem(name) ?? ""),
  }));
  const indexedDbDump = await collectIndexedDbDump();
  return {
    cookies: [],
    origins: [
      {
        origin: window.location.origin,
        localStorage: localStorageDump,
        indexedDB: indexedDbDump,
      },
    ],
  };
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function PlaywrightAuthHelperPage() {
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");
  const [authClientReady, setAuthClientReady] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) {
      setError("Firebase auth client is unavailable in this browser session.");
      return;
    }
    setAuthClientReady(true);
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser || null);
      if (!nextUser) {
        setStatus("");
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOrigin(window.location.origin);
  }, []);

  async function handleExport() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const dump = await buildPlaywrightStorageDump();
      downloadJson("user.json", dump);
      setStatus("Downloaded Playwright auth state as user.json.");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to export auth state.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#0d0f13",
        color: "#f5f7fb",
        padding: "40px 20px",
        fontFamily: "var(--font-readable)",
      }}
    >
      <div
        style={{
          maxWidth: 860,
          margin: "0 auto",
          border: "1px solid rgba(255,255,255,0.14)",
          background: "linear-gradient(180deg, rgba(18,20,26,0.98), rgba(9,11,16,0.98))",
          boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
          padding: 24,
        }}
      >
        <p className="displayFont" style={{ margin: 0, fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b9c2cf" }}>
          Development Helper
        </p>
        <h1 className="displayFont" style={{ margin: "10px 0 8px", fontSize: 30 }}>
          Playwright Auth Export
        </h1>
        <p style={{ margin: "0 0 18px", lineHeight: 1.6, color: "#d6dbe4" }}>
          Use this page in your normal signed-in browser to export the current origin storage in Playwright&apos;s
          `storageState` format. Save the downloaded file as `tests/e2e/.auth/user.json`, then run the authenticated
          Playwright suites.
        </p>

        <div style={{ padding: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", marginBottom: 18 }}>
          <div style={{ marginBottom: 8 }}>
            <strong>Current auth state:</strong>{" "}
            {user
              ? `Signed in as ${user.email || user.uid}`
              : authClientReady
                ? "No authenticated Firebase user detected right now."
                : "Auth client not ready yet."}
          </div>
          <div>
            <strong>Origin:</strong> {origin}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <button
            type="button"
            onClick={handleExport}
            disabled={busy}
            style={{
              appearance: "none",
              WebkitAppearance: "none",
              border: "1px solid rgba(216,255,94,0.45)",
              background: "linear-gradient(180deg, #e4ff5a, #b8ef1c)",
              color: "#08110d",
              fontFamily: "var(--font-display-ui)",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "12px 18px",
              cursor: busy ? "progress" : "pointer",
              pointerEvents: "auto",
              position: "relative",
              zIndex: 2,
            }}
          >
            {busy ? "Exporting..." : "Download user.json"}
          </button>
          <a
            href="/web-sign-in"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(255,255,255,0.24)",
              background: "rgba(255,255,255,0.03)",
              color: "#f5f7fb",
              fontFamily: "var(--font-display-ui)",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "12px 18px",
              textDecoration: "none",
              pointerEvents: "auto",
              position: "relative",
              zIndex: 2,
            }}
          >
            Open Web Sign-In
          </a>
        </div>

        {status ? <div style={{ marginBottom: 12, color: "#d8ff5e" }}>{status}</div> : null}
        {error ? <div style={{ marginBottom: 12, color: "#ff8f8f" }}>{error}</div> : null}

        <div style={{ lineHeight: 1.7, color: "#c7d0dc" }}>
          <p style={{ margin: "0 0 8px" }}>
            1. Open this page in your regular browser after you have already signed in to TaskLaunch.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            2. Click <strong>Download user.json</strong>.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            3. If the auth state line above does not show your account, sign in first via <code>/web-sign-in</code>, then export.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            4. Move the downloaded file into <code>tests/e2e/.auth/user.json</code> in this repo.
          </p>
          <p style={{ margin: 0 }}>
            5. Run <code>npm run test:e2e:auth</code> or <code>npm run test:e2e:mobile</code> from the repo root.
          </p>
        </div>
      </div>
    </main>
  );
}
