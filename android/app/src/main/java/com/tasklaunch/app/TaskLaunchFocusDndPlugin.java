package com.tasklaunch.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TaskLaunchFocusDnd")
public class TaskLaunchFocusDndPlugin extends Plugin {
    private static boolean focusDndSessionActive = false;
    private static int previousInterruptionFilter = NotificationManager.INTERRUPTION_FILTER_UNKNOWN;

    @PluginMethod
    public void getDndStatus(PluginCall call) {
        JSObject result = new JSObject();
        NotificationManager notificationManager = getNotificationManager();
        result.put("supported", isSupported());
        result.put("policyAccessGranted", hasPolicyAccess(notificationManager));
        result.put("active", focusDndSessionActive);
        result.put("interruptionFilter", interruptionFilterName(getCurrentInterruptionFilter(notificationManager)));
        call.resolve(result);
    }

    @PluginMethod
    public void openDndAccessSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (Exception ignored) {
            Intent fallback = new Intent(Settings.ACTION_SETTINGS);
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(fallback);
        }
        call.resolve();
    }

    @PluginMethod
    public void startFocusDndSession(PluginCall call) {
        NotificationManager notificationManager = getNotificationManager();
        if (!isSupported()) {
            call.resolve();
            return;
        }
        if (!hasPolicyAccess(notificationManager)) {
            call.reject("Do Not Disturb access is required.");
            return;
        }
        try {
            if (!focusDndSessionActive) {
                previousInterruptionFilter = notificationManager.getCurrentInterruptionFilter();
                focusDndSessionActive = true;
            }
            notificationManager.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not enable Focus Do Not Disturb.", error);
        }
    }

    @PluginMethod
    public void stopFocusDndSession(PluginCall call) {
        NotificationManager notificationManager = getNotificationManager();
        if (!focusDndSessionActive || notificationManager == null || !hasPolicyAccess(notificationManager)) {
            focusDndSessionActive = false;
            previousInterruptionFilter = NotificationManager.INTERRUPTION_FILTER_UNKNOWN;
            call.resolve();
            return;
        }
        try {
            int restoreFilter = previousInterruptionFilter;
            if (restoreFilter == NotificationManager.INTERRUPTION_FILTER_UNKNOWN) {
                restoreFilter = NotificationManager.INTERRUPTION_FILTER_ALL;
            }
            notificationManager.setInterruptionFilter(restoreFilter);
            focusDndSessionActive = false;
            previousInterruptionFilter = NotificationManager.INTERRUPTION_FILTER_UNKNOWN;
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not restore Do Not Disturb state.", error);
        }
    }

    private boolean isSupported() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M;
    }

    private NotificationManager getNotificationManager() {
        return (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private boolean hasPolicyAccess(NotificationManager notificationManager) {
        try {
            return isSupported() && notificationManager != null && notificationManager.isNotificationPolicyAccessGranted();
        } catch (Exception ignored) {
            return false;
        }
    }

    private int getCurrentInterruptionFilter(NotificationManager notificationManager) {
        try {
            return notificationManager == null
                ? NotificationManager.INTERRUPTION_FILTER_UNKNOWN
                : notificationManager.getCurrentInterruptionFilter();
        } catch (Exception ignored) {
            return NotificationManager.INTERRUPTION_FILTER_UNKNOWN;
        }
    }

    private String interruptionFilterName(int filter) {
        if (filter == NotificationManager.INTERRUPTION_FILTER_ALL) return "all";
        if (filter == NotificationManager.INTERRUPTION_FILTER_PRIORITY) return "priority";
        if (filter == NotificationManager.INTERRUPTION_FILTER_ALARMS) return "alarms";
        if (filter == NotificationManager.INTERRUPTION_FILTER_NONE) return "none";
        return "unknown";
    }
}
