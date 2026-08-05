import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import type { DeletedTaskMeta, Task } from "@/app/tasktimer/lib/types";

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

  function deletedTasksCollection(uid: string) {
    return db.collection("users").doc(uid).collection("deletedTasks");
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
    async loadTaskStatusMeta(uid: string) {
      const safeUid = asString(uid, 120);
      if (!safeUid) return {};
      const snap = await deletedTasksCollection(safeUid).get();
      const meta: DeletedTaskMeta = {};
      for (const docSnap of snap.docs as Array<{ id: string; data: () => Record<string, unknown> }>) {
        const data = docSnap.data();
        const name = asString(data.name, 200) || asString((data.taskSnapshot as { name?: unknown } | undefined)?.name, 200);
        if (!name) continue;
        meta[docSnap.id] = {
          name,
          color: typeof data.color === "string" ? data.color : null,
          deletedAt: Math.max(0, Math.floor(Number(data.deletedAt || 0) || 0)),
          state: data.state === "archived" ? "archived" : "deleted",
          taskSnapshot: (data.taskSnapshot as Task | null | undefined) || null,
        };
      }
      return meta;
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
    async deleteTasks(uid: string, taskIds: string[]) {
      const safeUid = asString(uid, 120);
      if (!safeUid) return;
      const batch = db.batch();
      for (const taskId of taskIds.map((id) => asString(id, 120)).filter(Boolean)) {
        batch.delete(tasksCollection(safeUid).doc(taskId));
      }
      await batch.commit();
    },
    async hasTaskDependents(uid: string, taskId: string) {
      const safeUid = asString(uid, 120);
      const safeTaskId = asString(taskId, 120);
      if (!safeUid || !safeTaskId) return true;
      const legacyHistorySnap = await tasksCollection(safeUid).doc(safeTaskId).collection("history").limit(1).get();
      if (!legacyHistorySnap.empty) return true;
      const canonicalHistorySnap = await db
        .collection("users")
        .doc(safeUid)
        .collection("historyEntries")
        .where("taskId", "==", safeTaskId)
        .limit(1)
        .get();
      return !canonicalHistorySnap.empty;
    },
  };
}
