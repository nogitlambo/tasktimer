package com.tasklaunch.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

public class TaskLaunchTimeGoalAlarmReceiver extends BroadcastReceiver {
    private static final String CHANNEL_ID = "tasklaunch-default";
    private static final String NOTIFICATION_KIND_TIME_GOAL_COMPLETE = "timeGoalComplete";
    private static final String EVENT_TIME_GOAL_COMPLETE = "timeGoalComplete";

    @Override
    public void onReceive(Context context, Intent intent) {
        String taskId = valueOrEmpty(intent.getStringExtra("taskId"));
        if (taskId.isEmpty()) return;
        String taskName = valueOrEmpty(intent.getStringExtra("taskName"));
        if (taskName.isEmpty()) taskName = "Task";
        cancelRunningNotification(context, taskId);
        ensureNotificationChannel(context);
        int notificationId = stableId("tasklaunch-time-goal-complete:" + taskId);
        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        openIntent.putExtra("taskId", taskId);
        openIntent.putExtra("route", "/tasklaunch");
        openIntent.putExtra("taskName", taskName);
        openIntent.putExtra("eventType", EVENT_TIME_GOAL_COMPLETE);
        openIntent.putExtra("notificationKind", NOTIFICATION_KIND_TIME_GOAL_COMPLETE);
        openIntent.putExtra("tasktimerActionId", "default");
        openIntent.putExtra("tasktimerNotificationId", notificationId);
        PendingIntent contentPendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String body = "Return to TaskLaunch to view XP awarded for " + taskName + ".";
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(context.getApplicationInfo().icon)
            .setContentTitle("Time Goal Reached")
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentPendingIntent);
        NotificationManagerCompat.from(context).notify(notificationId, builder.build());
    }

    private void cancelRunningNotification(Context context, String taskId) {
        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) notificationManager.cancel(runningNotificationId(taskId));
    }

    private void ensureNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null || notificationManager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "TaskLaunch",
            NotificationManager.IMPORTANCE_HIGH
        );
        notificationManager.createNotificationChannel(channel);
    }

    private int runningNotificationId(String taskId) {
        int hash = ("tasklaunch-running-timer:" + valueOrEmpty(taskId)).hashCode();
        if (hash == Integer.MIN_VALUE) return 1;
        int id = Math.abs(hash);
        return id == 0 ? 1 : id;
    }

    private int stableId(String value) {
        int hash = value.hashCode();
        return hash == Integer.MIN_VALUE ? 1 : Math.max(1, Math.abs(hash));
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
