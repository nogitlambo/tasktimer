package com.tasklaunch.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class TaskLaunchCheckpointAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String taskId = value(intent.getStringExtra("taskId"));
        String checkpointKey = value(intent.getStringExtra("checkpointKey"));
        TaskLaunchCheckpointAlarmManager.markFired(context, taskId, checkpointKey);
        TaskLaunchCheckpointAlarmService.start(context, intent);
    }

    private String value(String input) { return input == null ? "" : input.trim(); }
}
