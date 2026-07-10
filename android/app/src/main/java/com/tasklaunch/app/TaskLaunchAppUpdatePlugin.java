package com.tasklaunch.app;

import android.app.Activity;
import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;

@CapacitorPlugin(name = "TaskLaunchAppUpdate", requestCodes = { TaskLaunchAppUpdatePlugin.IMMEDIATE_UPDATE_REQUEST_CODE })
public class TaskLaunchAppUpdatePlugin extends Plugin {
    static final int IMMEDIATE_UPDATE_REQUEST_CODE = 42030;
    private PluginCall pendingUpdateCall;

    @PluginMethod
    public void checkForImmediateUpdate(PluginCall call) {
        if (pendingUpdateCall != null) {
            call.resolve(result("started", null, null, null, "Immediate update flow is already pending."));
            return;
        }

        AppUpdateManager appUpdateManager;
        try {
            appUpdateManager = AppUpdateManagerFactory.create(getContext());
        } catch (Exception error) {
            call.resolve(result("failed", null, null, null, errorMessage("Could not create app update manager.", error)));
            return;
        }

        appUpdateManager.getAppUpdateInfo()
            .addOnSuccessListener(appUpdateInfo -> handleAppUpdateInfo(call, appUpdateManager, appUpdateInfo))
            .addOnFailureListener(error ->
                call.resolve(result("failed", null, null, null, errorMessage("Could not check for app updates.", error)))
            );
    }

    private void handleAppUpdateInfo(PluginCall call, AppUpdateManager appUpdateManager, AppUpdateInfo appUpdateInfo) {
        int updateAvailability = appUpdateInfo.updateAvailability();
        int availableVersionCode = appUpdateInfo.availableVersionCode();
        boolean updateAvailable =
            updateAvailability == UpdateAvailability.UPDATE_AVAILABLE ||
            updateAvailability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS;

        if (!updateAvailable) {
            call.resolve(result("not_available", availableVersionCode, updateAvailability, null, null));
            return;
        }

        if (!appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) {
            call.resolve(result("not_allowed", availableVersionCode, updateAvailability, null, null));
            return;
        }

        try {
            pendingUpdateCall = call;
            boolean started = appUpdateManager.startUpdateFlowForResult(
                appUpdateInfo,
                getActivity(),
                AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build(),
                IMMEDIATE_UPDATE_REQUEST_CODE
            );
            if (!started) {
                pendingUpdateCall = null;
                call.resolve(result("failed", availableVersionCode, updateAvailability, null, "Immediate update flow did not start."));
            }
        } catch (Exception error) {
            pendingUpdateCall = null;
            call.resolve(result("failed", availableVersionCode, updateAvailability, null, errorMessage("Could not start immediate update flow.", error)));
        }
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != IMMEDIATE_UPDATE_REQUEST_CODE) return;
        PluginCall call = pendingUpdateCall;
        pendingUpdateCall = null;
        if (call == null) return;

        if (resultCode == Activity.RESULT_OK) {
            call.resolve(result("started", null, null, resultCode, null));
            return;
        }
        String message = resultCode == Activity.RESULT_CANCELED
            ? "Immediate update flow was cancelled."
            : "Immediate update flow failed.";
        call.resolve(result("failed", null, null, resultCode, message));
    }

    private JSObject result(String status, Integer availableVersionCode, Integer updateAvailability, Integer resultCode, String message) {
        JSObject result = new JSObject();
        result.put("status", status);
        if (availableVersionCode != null) result.put("availableVersionCode", availableVersionCode);
        if (updateAvailability != null) result.put("updateAvailability", updateAvailability);
        if (resultCode != null) result.put("resultCode", resultCode);
        if (message != null && !message.trim().isEmpty()) result.put("message", message.trim());
        return result;
    }

    private String errorMessage(String fallback, Exception error) {
        String message = error == null ? "" : String.valueOf(error.getMessage()).trim();
        return message.isEmpty() ? fallback : message;
    }
}
