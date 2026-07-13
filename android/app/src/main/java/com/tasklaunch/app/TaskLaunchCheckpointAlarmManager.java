package com.tasklaunch.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

public final class TaskLaunchCheckpointAlarmManager {
    private static final String PREFS = "tasklaunch-checkpoint-alarms";
    private static final String KEY_SCHEDULE = "schedule";

    private TaskLaunchCheckpointAlarmManager() {}

    public static synchronized void sync(Context context, String scheduleJson) {
        Context app = context.getApplicationContext();
        cancelJson(app, storedJson(app));
        JSONArray incoming = parse(scheduleJson);
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_SCHEDULE, incoming.toString()).apply();
        scheduleJson(app, incoming);
    }

    public static synchronized void restore(Context context) {
        scheduleJson(context.getApplicationContext(), parse(storedJson(context)));
    }

    public static synchronized void cancelForTask(Context context, String taskId) {
        JSONArray current = parse(storedJson(context));
        JSONArray retained = new JSONArray();
        for (int index = 0; index < current.length(); index++) {
            JSONObject alarm = current.optJSONObject(index);
            if (alarm == null) continue;
            if (taskId.equals(alarm.optString("taskId"))) cancelOne(context, alarm);
            else retained.put(alarm);
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_SCHEDULE, retained.toString()).apply();
        TaskLaunchCheckpointAlarmService.stop(context, taskId);
    }

    public static synchronized void markFired(Context context, String taskId, String checkpointKey) {
        JSONArray current = parse(storedJson(context));
        JSONArray retained = new JSONArray();
        for (int index = 0; index < current.length(); index++) {
            JSONObject alarm = current.optJSONObject(index);
            if (alarm == null) continue;
            boolean fired = taskId.equals(alarm.optString("taskId")) && checkpointKey.equals(alarm.optString("checkpointKey"));
            if (!fired) retained.put(alarm);
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_SCHEDULE, retained.toString()).apply();
    }

    private static void scheduleJson(Context context, JSONArray alarms) {
        long now = System.currentTimeMillis();
        for (int index = 0; index < alarms.length(); index++) {
            JSONObject alarm = alarms.optJSONObject(index);
            if (alarm != null && alarm.optLong("triggerAtMs", 0L) > now) scheduleOne(context, alarm);
        }
    }

    private static void scheduleOne(Context context, JSONObject alarm) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) return;
        PendingIntent operation = pendingIntent(context, alarm, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.optLong("triggerAtMs"), operation);
    }

    private static void cancelJson(Context context, String json) {
        JSONArray alarms = parse(json);
        for (int index = 0; index < alarms.length(); index++) {
            JSONObject alarm = alarms.optJSONObject(index);
            if (alarm != null) cancelOne(context, alarm);
        }
    }

    private static void cancelOne(Context context, JSONObject alarm) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        PendingIntent operation = pendingIntent(context, alarm, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (operation != null) {
            manager.cancel(operation);
            operation.cancel();
        }
    }

    private static PendingIntent pendingIntent(Context context, JSONObject alarm, int flags) {
        String taskId = alarm.optString("taskId");
        String checkpointKey = alarm.optString("checkpointKey");
        Intent intent = new Intent(context, TaskLaunchCheckpointAlarmReceiver.class)
            .setAction("com.tasklaunch.app.CHECKPOINT." + taskId + "." + checkpointKey)
            .putExtra("taskId", taskId)
            .putExtra("taskName", alarm.optString("taskName", "Task"))
            .putExtra("checkpointKey", checkpointKey)
            .putExtra("checkpointLabel", alarm.optString("checkpointLabel", "Checkpoint"))
            .putExtra("soundMode", alarm.optString("soundMode", "once"))
            .putExtra("soundEnabled", alarm.optBoolean("soundEnabled", true))
            .putExtra("vibrationEnabled", alarm.optBoolean("vibrationEnabled", false));
        return PendingIntent.getBroadcast(context, stableId(taskId + ":" + checkpointKey), intent, flags);
    }

    private static int stableId(String value) {
        int hash = value.hashCode();
        return hash == Integer.MIN_VALUE ? 1 : Math.max(1, Math.abs(hash));
    }

    private static String storedJson(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SCHEDULE, "[]");
    }

    private static JSONArray parse(String value) {
        try { return new JSONArray(value == null ? "[]" : value); }
        catch (Exception ignored) { return new JSONArray(); }
    }
}
