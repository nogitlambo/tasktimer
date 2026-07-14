package com.tasklaunch.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public final class TaskLaunchTimeGoalAlarmManager {
    private TaskLaunchTimeGoalAlarmManager() {}

    public static synchronized void schedule(Context context, String taskId, String taskName, long triggerAtMs) {
        String normalizedTaskId = valueOrEmpty(taskId);
        if (normalizedTaskId.isEmpty() || triggerAtMs <= System.currentTimeMillis()) return;
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) return;
        PendingIntent operation = pendingIntent(
            context,
            normalizedTaskId,
            valueOrEmpty(taskName).isEmpty() ? "Task" : valueOrEmpty(taskName),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, operation);
    }

    public static synchronized void cancel(Context context, String taskId) {
        String normalizedTaskId = valueOrEmpty(taskId);
        if (normalizedTaskId.isEmpty()) return;
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        PendingIntent operation = pendingIntent(
            context,
            normalizedTaskId,
            "Task",
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (operation != null) {
            manager.cancel(operation);
            operation.cancel();
        }
    }

    private static PendingIntent pendingIntent(Context context, String taskId, String taskName, int flags) {
        Intent intent = new Intent(context, TaskLaunchTimeGoalAlarmReceiver.class)
            .setAction("com.tasklaunch.app.TIME_GOAL_COMPLETE." + taskId)
            .putExtra("taskId", taskId)
            .putExtra("taskName", taskName);
        return PendingIntent.getBroadcast(context, stableId("tasklaunch-time-goal:" + taskId), intent, flags);
    }

    private static int stableId(String value) {
        int hash = value.hashCode();
        return hash == Integer.MIN_VALUE ? 1 : Math.max(1, Math.abs(hash));
    }

    private static String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
