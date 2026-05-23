package com.tasklaunch.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class TaskLaunchPushActionReceiver extends BroadcastReceiver {
    private static final String ACTION_CLOSE_RUNNING_TIMER = "closeRunningTimerNotification";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;

        int notificationId = intent.getIntExtra("tasktimerNotificationId", 0);
        String nativeAction = valueOrEmpty(intent.getStringExtra("tasktimerNativeAction"));
        String actionId = valueOrEmpty(intent.getStringExtra("tasktimerActionId"));
        if (ACTION_CLOSE_RUNNING_TIMER.equals(nativeAction)) {
            cancelNotification(context, notificationId);
            return;
        }

        if (notificationId != 0 && !"launchTask".equals(actionId)) {
            cancelNotification(context, notificationId);
        }

        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launchIntent.putExtras(intent);
        context.startActivity(launchIntent);
    }

    private void cancelNotification(Context context, int notificationId) {
        if (notificationId != 0) {
            NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                notificationManager.cancel(notificationId);
            }
        }
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
