package com.tasklaunch.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class TaskLaunchCheckpointBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            TaskLaunchCheckpointAlarmManager.restore(context);
        }
    }
}
