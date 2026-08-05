import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import type { Task } from "@/app/tasktimer/lib/types";

import type { BrainDumpWorkspaceRepository } from "./brainDumpTaskCreation";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

export function createFirestoreBrainDumpWorkspaceRepository(): BrainDumpWorkspaceRepository {
  const db = getFirebaseAdminDb();

  function tasksCollection(uid: string) {
    return db.collection("users").doc(uid).collection("tasks");
  }

  return {
    async loadTasks(uid: string) {
      const safeUid = asString(uid, 120);
      if (!safeUid) return [];
      const snap = await tasksCollection(safeUid).get();
      return snap.docs.map((docSnap: { id: string; data: () => Record<string, unknown> }) => ({
        ...docSnap.data(),
        id: asString(docSnap.data().id, 120) || docSnap.id,
      })) as Task[];
    },
    async saveTasks(uid: string, tasks: Task[]) {
      const safeUid = asString(uid, 120);
      if (!safeUid) return;
      const batch = db.batch();
      for (const task of tasks) {
        const taskId = asString(task.id, 120);
        if (!taskId) continue;
        batch.set(tasksCollection(safeUid).doc(taskId), task, { merge: true });
      }
      await batch.commit();
    },
    async saveTask(uid: string, task: Task) {
      const safeUid = asString(uid, 120);
      const taskId = asString(task.id, 120);
      if (!safeUid || !taskId) return;
      await tasksCollection(safeUid).doc(taskId).set(task, { merge: true });
    },
  };
}
