import { redirect } from "next/navigation";
import TaskTimerPageClient from "./TaskTimerPageClient";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function normalizeInitialAppPage(raw: string | string[] | undefined): "tasks" | "dashboard" | "test1" | "test2" {
  const page = String(Array.isArray(raw) ? raw[0] : raw || "").trim().toLowerCase();
  if (page === "dashboard") return "dashboard";
  if (page === "test1") return "test1";
  if (page === "test2") return "test2";
  return "tasks";
}

export default async function TaskTimerPage({ searchParams }: { searchParams: SearchParams }) {
  const resolvedSearchParams = await searchParams;
  const initialAppPage = normalizeInitialAppPage(resolvedSearchParams?.page);
  if (initialAppPage === "dashboard") {
    redirect("/tasktimer/dashboard");
  }
  if (initialAppPage === "test2") {
    redirect("/tasktimer/friends");
  }
  return <TaskTimerPageClient initialAppPage={initialAppPage} />;
}
