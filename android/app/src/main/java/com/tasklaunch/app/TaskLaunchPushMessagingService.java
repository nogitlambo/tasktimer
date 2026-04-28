package com.tasklaunch.app;

import android.app.PendingIntent;
import android.content.Intent;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class TaskLaunchPushMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "tasklaunch-default";
    private static final String ACTION_LAUNCH_TASK = "launchTask";
    private static final String ACTION_SNOOZE_10M = "snooze10m";
    private static final String ACTION_POSTPONE_NEXT_GAP = "postponeNextGap";
    private static final String EVENT_PLANNED_START = "plannedStartReminder";
    private static final String EVENT_PLANNED_START_SNOOZED = "plannedStartReminderSnoozed";
    private static final String EVENT_UNSCHEDULED_GAP = "unscheduledGapReminder";
    private static final String EVENT_TIME_GOAL_COMPLETE = "timeGoalComplete";
    private static final String NOTIFICATION_KIND_PLANNED_START = "plannedStart";
    private static final String NOTIFICATION_KIND_UNSCHEDULED_GAP = "unscheduledGap";
    private static final String NOTIFICATION_KIND_TIME_GOAL_COMPLETE = "timeGoalComplete";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Map<String, String> data = remoteMessage.getData();
        if (!isActionNotification(data)) {
            PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
            return;
        }
        showActionNotification(remoteMessage, data);
    }

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }

    private boolean isActionNotification(Map<String, String> data) {
        String notificationKind = valueOrEmpty(data.get("notificationKind"));
        String eventType = valueOrEmpty(data.get("eventType"));
        return (NOTIFICATION_KIND_PLANNED_START.equals(notificationKind) &&
            (EVENT_PLANNED_START.equals(eventType) || EVENT_PLANNED_START_SNOOZED.equals(eventType))) ||
            (NOTIFICATION_KIND_UNSCHEDULED_GAP.equals(notificationKind) && EVENT_UNSCHEDULED_GAP.equals(eventType)) ||
            (NOTIFICATION_KIND_TIME_GOAL_COMPLETE.equals(notificationKind) && EVENT_TIME_GOAL_COMPLETE.equals(eventType));
    }

    private void showActionNotification(RemoteMessage remoteMessage, Map<String, String> data) {
        String taskName = valueOrEmpty(data.get("taskName"));
        if (taskName.isEmpty()) taskName = "Task";
        String route = valueOrEmpty(data.get("route"));
        if (route.isEmpty()) route = "/tasklaunch";
        String taskId = valueOrEmpty(data.get("taskId"));
        String messageId = valueOrEmpty(remoteMessage.getMessageId());
        String eventType = valueOrEmpty(data.get("eventType"));
        String notificationKind = valueOrEmpty(data.get("notificationKind"));
        long dueAtMs = parseLongOrZero(data.get("dueAtMs"));
        boolean isUnscheduledGap = NOTIFICATION_KIND_UNSCHEDULED_GAP.equals(notificationKind) &&
            EVENT_UNSCHEDULED_GAP.equals(eventType);
        boolean isTimeGoalComplete = NOTIFICATION_KIND_TIME_GOAL_COMPLETE.equals(notificationKind) &&
            EVENT_TIME_GOAL_COMPLETE.equals(eventType);
        String title = isTimeGoalComplete ? "Time Goal Reached" : isUnscheduledGap ? "Open Gap Available" : "Task Reminder";
        String body = isTimeGoalComplete
            ? "Return to TaskLaunch to view XP awarded for " + taskName + "."
            : isUnscheduledGap
                ? "You have time to start " + taskName + " before your next scheduled task."
                : taskName + " is scheduled to start now.";
        String primaryLabel = isUnscheduledGap ? "Start" : "Launch";
        String secondaryLabel = isUnscheduledGap ? "Postpone" : "Snooze 10m";
        String secondaryActionId = isUnscheduledGap ? ACTION_POSTPONE_NEXT_GAP : ACTION_SNOOZE_10M;

        int notificationId = Math.abs((messageId.isEmpty() ? (taskId + route) : messageId).hashCode());
        String contentActionId = isTimeGoalComplete ? "default" : ACTION_LAUNCH_TASK;
        Intent defaultIntent = buildReceiverIntent(
            taskId,
            route,
            taskName,
            messageId,
            contentActionId,
            notificationId,
            eventType,
            notificationKind,
            dueAtMs
        );
        Intent launchIntent = buildReceiverIntent(taskId, route, taskName, messageId, ACTION_LAUNCH_TASK, notificationId, eventType, notificationKind, dueAtMs);
        Intent secondaryIntent = buildReceiverIntent(taskId, route, taskName, messageId, secondaryActionId, notificationId, eventType, notificationKind, dueAtMs);

        PendingIntent contentPendingIntent = PendingIntent.getBroadcast(
            this,
            notificationId,
            defaultIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent launchPendingIntent = PendingIntent.getBroadcast(
            this,
            notificationId + 1,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent secondaryPendingIntent = PendingIntent.getBroadcast(
            this,
            notificationId + 2,
            secondaryIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentPendingIntent);
        if (!isTimeGoalComplete) {
            builder
                .addAction(0, primaryLabel, launchPendingIntent)
                .addAction(0, secondaryLabel, secondaryPendingIntent);
        }
        if (!isUnscheduledGap && !isTimeGoalComplete && dueAtMs > 0) {
            long whenMs = System.currentTimeMillis() - Math.max(0L, System.currentTimeMillis() - dueAtMs);
            builder
                .setWhen(whenMs)
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setChronometerCountDown(false)
                .setSubText("Started");
        }

        NotificationManagerCompat.from(this).notify(notificationId, builder.build());
    }

    private Intent buildReceiverIntent(
        String taskId,
        String route,
        String taskName,
        String messageId,
        String actionId,
        int notificationId,
        String eventType,
        String notificationKind,
        long dueAtMs
    ) {
        Intent intent = new Intent(this, TaskLaunchPushActionReceiver.class);
        intent.putExtra("google.message_id", messageId);
        intent.putExtra("taskId", taskId);
        intent.putExtra("route", route);
        intent.putExtra("taskName", taskName);
        intent.putExtra("eventType", eventType);
        intent.putExtra("notificationKind", notificationKind);
        intent.putExtra("tasktimerActionId", actionId);
        intent.putExtra("tasktimerNotificationId", notificationId);
        intent.putExtra("tasktimerDueAtMs", dueAtMs);
        return intent;
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private long parseLongOrZero(String value) {
        try {
            return Long.parseLong(valueOrEmpty(value));
        } catch (Exception ignored) {
            return 0L;
        }
    }
}
