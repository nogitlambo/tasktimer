package com.tasklaunch.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class TaskLaunchCheckpointAlarmActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String taskId = value(intent.getStringExtra("taskId"));
        TaskLaunchCheckpointAlarmService.stop(context, taskId);
        if (!"com.tasklaunch.app.OPEN_CHECKPOINT_ALARM".equals(intent.getAction())) return;
        Intent launch = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("taskId", taskId)
            .putExtra("route", "/tasklaunch")
            .putExtra("tasktimerActionId", "default");
        context.startActivity(launch);
    }

    private String value(String input) { return input == null ? "" : input.trim(); }
}
