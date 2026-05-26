package com.tasklaunch.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TaskLaunchTimerNotification")
public class TaskLaunchTimerNotificationPlugin extends Plugin {
    private static final String RUNNING_TIMER_CHANNEL_ID = "tasklaunch-running-timer";
    private static final String ACTION_CLOSE_RUNNING_TIMER = "closeRunningTimerNotification";

    @PluginMethod
    public void showRunningTimer(PluginCall call) {
        String taskId = valueOrEmpty(call.getString("taskId"));
        if (taskId.isEmpty()) {
            call.reject("A valid taskId is required.");
            return;
        }

        String taskName = valueOrEmpty(call.getString("taskName"));
        if (taskName.isEmpty()) taskName = "Task";
        long startedAtMs = normalizeLong(call.getLong("startedAtMs"), System.currentTimeMillis());
        long elapsedBeforeStartMs = Math.max(0L, normalizeLong(call.getLong("elapsedBeforeStartMs"), 0L));
        int notificationId = runningNotificationId(taskId);
        int sourceNotificationId = normalizeInt(call.getInt("sourceNotificationId"), 0);

        if (sourceNotificationId != 0 && sourceNotificationId != notificationId) {
            NotificationManager notificationManager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                notificationManager.cancel(sourceNotificationId);
            }
        }
        ensureNotificationChannel();

        Intent openIntent = new Intent(getContext(), MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        openIntent.putExtra("taskId", taskId);
        openIntent.putExtra("route", "/tasklaunch");
        openIntent.putExtra("taskName", taskName);
        openIntent.putExtra("tasktimerActionId", "default");
        openIntent.putExtra("tasktimerNotificationId", notificationId);

        Intent closeIntent = new Intent(getContext(), TaskLaunchPushActionReceiver.class);
        closeIntent.putExtra("tasktimerNativeAction", ACTION_CLOSE_RUNNING_TIMER);
        closeIntent.putExtra("tasktimerNotificationId", notificationId);

        PendingIntent openPendingIntent = PendingIntent.getActivity(
            getContext(),
            notificationId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent closePendingIntent = PendingIntent.getBroadcast(
            getContext(),
            notificationId + 1,
            closeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        long chronometerBaseMs = Math.max(0L, startedAtMs - elapsedBeforeStartMs);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), RUNNING_TIMER_CHANNEL_ID)
            .setSmallIcon(getContext().getApplicationInfo().icon)
            .setContentTitle(taskName)
            .setContentText("Timer running")
            .setSubText("Running")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setSilent(true)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setShowWhen(true)
            .setWhen(chronometerBaseMs)
            .setUsesChronometer(true)
            .setChronometerCountDown(false)
            .setContentIntent(openPendingIntent)
            .addAction(0, "Close", closePendingIntent);

        NotificationManagerCompat.from(getContext()).notify(notificationId, builder.build());
        JSObject result = new JSObject();
        result.put("notificationId", notificationId);
        call.resolve(result);
    }

    @PluginMethod
    public void clearRunningTimer(PluginCall call) {
        String taskId = valueOrEmpty(call.getString("taskId"));
        if (taskId.isEmpty()) {
            call.resolve();
            return;
        }
        NotificationManager notificationManager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.cancel(runningNotificationId(taskId));
        }
        call.resolve();
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager notificationManager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null || notificationManager.getNotificationChannel(RUNNING_TIMER_CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            RUNNING_TIMER_CHANNEL_ID,
            "TaskLaunch Timer Running",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Silent notification shown while a TaskLaunch timer is running");
        channel.setSound(null, null);
        channel.enableVibration(false);
        notificationManager.createNotificationChannel(channel);
    }

    private int runningNotificationId(String taskId) {
        int hash = ("tasklaunch-running-timer:" + valueOrEmpty(taskId)).hashCode();
        if (hash == Integer.MIN_VALUE) return 1;
        int id = Math.abs(hash);
        return id == 0 ? 1 : id;
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private long normalizeLong(Long value, long fallback) {
        return value == null ? fallback : value.longValue();
    }

    private int normalizeInt(Integer value, int fallback) {
        return value == null ? fallback : value.intValue();
    }
}
