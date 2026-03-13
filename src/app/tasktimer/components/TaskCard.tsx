"use client";

import React from "react";
import TaskTimerTaskCard from "@/features/tasktimer-react/components/TaskTimerTaskCard";
import type { TaskTimerTask } from "@/features/tasktimer-react/model/types";

type TaskCardProps = {
  task: TaskTimerTask;
};

export default function TaskCard({ task }: TaskCardProps) {
  return <TaskTimerTaskCard task={task} />;
}
