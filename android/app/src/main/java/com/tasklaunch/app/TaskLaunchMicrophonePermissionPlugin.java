package com.tasklaunch.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "TaskLaunchMicrophonePermission",
    permissions = @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = TaskLaunchMicrophonePermissionPlugin.MICROPHONE)
)
public class TaskLaunchMicrophonePermissionPlugin extends Plugin {
    static final String MICROPHONE = "microphone";

    @PluginMethod
    public void getMicrophonePermissionStatus(PluginCall call) {
        resolvePermissionStatus(call);
    }

    @PluginMethod
    public void requestMicrophonePermission(PluginCall call) {
        if (getPermissionState(MICROPHONE) == PermissionState.GRANTED) {
            resolvePermissionStatus(call);
            return;
        }
        requestPermissionForAlias(MICROPHONE, call, "microphonePermissionCallback");
    }

    @PluginMethod
    public void openMicrophonePermissionSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not open Android app settings.", error);
        }
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        resolvePermissionStatus(call);
    }

    private void resolvePermissionStatus(PluginCall call) {
        PermissionState state = getPermissionState(MICROPHONE);
        JSObject result = new JSObject();
        result.put("granted", state == PermissionState.GRANTED);
        result.put("state", state == null ? "denied" : state.toString());
        call.resolve(result);
    }
}
