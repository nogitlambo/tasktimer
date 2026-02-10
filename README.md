[README.md](https://github.com/user-attachments/files/25197279/README.md)
# TaskTimer

## Purpose

TaskTimer is a lightweight, offline-first task timer that lets you create multiple tasks, track time per task, reset timers into a session history, and review recent totals with an in-app chart. All data is stored locally on the device.

Key UX surfaces include the main task list, a full-screen menu, task edit modals (including optional milestones), a history chart screen, and a history manager screen. fileciteturn2file2L588-L656

## How to run

Option A: Open directly
1. Download or clone the project.
2. Open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari).

Option B: Run a local static server (recommended)
Some browsers apply extra restrictions when loading from `file://`. Running a local server avoids those edge cases.

Python:
- `python -m http.server 8000`
- Open `http://localhost:8000`

Node:
- `npx serve`
- Open the URL printed in the terminal.

No build step is required.

## Main features

- Task CRUD: add tasks, edit task name and time, duplicate, delete, and reset.
- Per-task timer: start/stop timing; elapsed time is tracked per task.
- Session history: when a task is reset (or all tasks are reset), the current elapsed time can be logged into History as a completed session. fileciteturn3file2L1-L27
- History retention: history entries are automatically trimmed to the last 120 days. fileciteturn3file4L22-L34
- Weekly chart view: the History screen renders a per-day bar chart on a `<canvas>` element. fileciteturn2file2L588-L607
- History Manager: a full-screen manager to expand tasks and delete individual history entries. fileciteturn2file2L628-L638
- Backups: export/import a JSON backup, including tasks and history. fileciteturn2file2L650-L653 fileciteturn3file0L1-L22

## High-level architecture

This project is a single-page, single-file web app (HTML + CSS + vanilla JS). The JavaScript lives inside one IIFE to avoid leaking globals. fileciteturn3file1L1-L4

### UI layer

The HTML defines:
- Main screen: task list container and the “Add Task” entry point. fileciteturn2file2L579-L586
- Full-screen overlays/modals: Menu, About, How To, Appearance, Contact, Add Task, Edit Task, and confirmations.
- Full-screen screens: History (chart), History Manager, and a circular “Clock” view (canvas-based). fileciteturn2file2L588-L626

The JS caches key DOM elements into a single `els` object (a lightweight view-model) and uses event listeners plus event delegation to handle UI actions. fileciteturn3file1L36-L60

### Data model

Tasks are plain objects held in memory in a `tasks` array and persisted to localStorage. Each task includes:
- `id`: unique task identifier
- `name`: display name
- `order`: ordering key for stable sorting
- `accumulatedMs`: total elapsed time already committed
- `running` and `startMs`: runtime state for active timing
- `collapsed`: UI state
- `milestonesEnabled` and `milestones`: optional milestone list used to drive the progress bar
- `hasStarted`: used to decide whether a session is eligible to be logged into History

Task storage is written to localStorage via `save()` using the key `taskticker_tasks_v1`. fileciteturn3file1L4-L5 fileciteturn3file4L1-L3

### Timer engine

The timer is computed using a “start timestamp + accumulated time” approach:
- When running, elapsed time is `accumulatedMs + (now - startMs)`
- When stopped, elapsed time is `accumulatedMs`

This avoids incrementing counters every second and keeps timing accurate even if the tab is backgrounded.

### History subsystem

History is stored separately as a map of `taskId -> [entries]`:
- Entry shape: `{ ts, name, ms, color? }`, where `ts` is a timestamp and `ms` is the session duration.
- History is persisted under `taskticker_history_v1` and trimmed to 120 days by `cleanupHistory()`. fileciteturn3file1L22-L28 fileciteturn3file4L6-L20 fileciteturn3file4L22-L34

Logging behavior:
- Resets can optionally log a completed session (based on the confirmation checkbox).
- A task must have been started since the last reset (`hasStarted`) and have a positive elapsed time to be considered eligible. fileciteturn3file3L85-L90

### Backup import/export

Backups are JSON files with a small schema wrapper:
- `schema: "taskticka_backup_v1"`
- `exportedAt: ISO string`
- `tasks: [...]`
- `history: {...}` fileciteturn3file0L1-L7

Import merges tasks and history into the current dataset. If an imported task id conflicts with an existing id, it is remapped and history is remapped to match. fileciteturn3file3L6-L39

### Key browser APIs used

- `localStorage` for persistence. fileciteturn3file4L1-L3
- `FileReader` for importing backups.
- `<canvas>` rendering for the history chart and the clock view. fileciteturn2file2L603-L605 fileciteturn2file2L619-L624
- `crypto.getRandomValues()` for id generation (with a fallback). 

## Files

- `index.html`: the full application (UI, styles, and JS).

## Notes and limitations

- Data is stored in the current browser profile. Clearing site data or using another device/browser will not carry data across unless you export/import a backup.
- If you plan to package this for mobile (WebView wrapper), localStorage behavior and file import UX can vary by platform; keep backup/export testing in your packaging target.
