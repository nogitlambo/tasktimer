"use client";

import React, { useEffect, useState } from "react";
import { useTaskTimerState } from "@/features/tasktimer-react";
import TaskCard from "./TaskCard";
import { selectVisibleTasks } from "@/features/tasktimer-react/model/selectors";
import type { MainMode } from "@/features/tasktimer-react/model/types";

type TaskListProps = {
  mode?: MainMode;
};

function getTileColumnCount() {
  if (typeof window === "undefined") return 1;
  if (window.matchMedia("(min-width: 1200px)").matches) return 3;
  if (window.matchMedia("(min-width: 720px)").matches) return 2;
  return 1;
}

export default function TaskList({ mode }: TaskListProps) {
  const state = useTaskTimerState();
  const [tileColumns, setTileColumns] = useState(1);
  const visibleTasks = selectVisibleTasks(state).filter((task) => !mode || task.mode === mode);

  useEffect(() => {
    if (state.taskView !== "tile") return;
    const updateColumns = () => setTileColumns(getTileColumnCount());
    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, [state.taskView]);

  if (state.status !== "ready") {
    return (
      <div className="list" id="taskList">
        <div className="settingsDetailNote taskListEmptyState">Loading tasks...</div>
      </div>
    );
  }

  if (!visibleTasks.length) {
    return (
      <div className="list" id="taskList">
        <div className="settingsDetailNote taskListEmptyState">No tasks in this category yet.</div>
      </div>
    );
  }

  if (state.taskView !== "tile") {
    return (
      <div className="list" id="taskList">
        {visibleTasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    );
  }

  const columns = Array.from({ length: tileColumns }, () => [] as typeof visibleTasks);
  visibleTasks.forEach((task, index) => {
    columns[index % tileColumns].push(task);
  });

  return (
    <div className="list" id="taskList" data-tile-columns={tileColumns}>
      {columns.map((column, index) => (
        <div key={`task-tile-col-${index}`} className="taskTileColumn">
          {column.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      ))}
    </div>
  );
}
