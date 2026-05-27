package com.tasklaunch.app;

import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(name = "TaskLaunchAppBlocker")
public class TaskLaunchAppBlockerPlugin extends Plugin {
    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("usageAccessGranted", hasUsageAccess());
        result.put("overlayPermissionGranted", hasOverlayPermission());
        result.put("active", TaskLaunchAppBlockerService.isBlockingActive());
        call.resolve(result);
    }

    @PluginMethod
    public void openUsageAccessSettings(PluginCall call) {
        openSettingsIntent(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
        call.resolve();
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        openSettingsIntent(intent);
        call.resolve();
    }

    @PluginMethod
    public void listLaunchableApps(PluginCall call) {
        PackageManager packageManager = getContext().getPackageManager();
        Intent launcherIntent = new Intent(Intent.ACTION_MAIN, null);
        launcherIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> activities = packageManager.queryIntentActivities(launcherIntent, 0);
        Collections.sort(activities, Comparator.comparing((ResolveInfo info) ->
            String.valueOf(info.loadLabel(packageManager)).toLowerCase()
        ));

        Set<String> seenPackages = new HashSet<>();
        JSArray apps = new JSArray();
        for (ResolveInfo info : activities) {
            if (info == null || info.activityInfo == null) continue;
            String packageName = valueOrEmpty(info.activityInfo.packageName);
            if (packageName.isEmpty() || packageName.equals(getContext().getPackageName()) || seenPackages.contains(packageName)) continue;
            seenPackages.add(packageName);
            JSObject app = new JSObject();
            app.put("packageName", packageName);
            app.put("label", getApplicationLabel(packageManager, info, packageName));
            apps.put(app);
        }

        JSObject result = new JSObject();
        result.put("apps", apps);
        call.resolve(result);
    }

    @PluginMethod
    public void startBlockingSession(PluginCall call) {
        JSArray rawPackages = call.getArray("blockedPackages");
        if (rawPackages == null || rawPackages.length() == 0) {
            call.resolve();
            return;
        }
        if (!hasUsageAccess()) {
            call.reject("Usage Access permission is required.");
            return;
        }
        if (!hasOverlayPermission()) {
            call.reject("Overlay permission is required.");
            return;
        }
        Intent intent = new Intent(getContext(), TaskLaunchAppBlockerService.class);
        intent.setAction(TaskLaunchAppBlockerService.ACTION_START);
        intent.putExtra(TaskLaunchAppBlockerService.EXTRA_TASK_ID, valueOrEmpty(call.getString("taskId")));
        intent.putExtra(TaskLaunchAppBlockerService.EXTRA_TASK_NAME, valueOrEmpty(call.getString("taskName")));
        intent.putExtra(TaskLaunchAppBlockerService.EXTRA_BLOCKED_PACKAGES_JSON, rawPackages.toString());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stopBlockingSession(PluginCall call) {
        Intent intent = new Intent(getContext(), TaskLaunchAppBlockerService.class);
        intent.setAction(TaskLaunchAppBlockerService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve();
    }

    private boolean hasUsageAccess() {
        try {
            AppOpsManager appOps = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
            if (appOps == null) return false;
            int mode = appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                getContext().getPackageName()
            );
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean hasOverlayPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(getContext());
    }

    private void openSettingsIntent(Intent intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (Exception ignored) {
            Intent fallback = new Intent(Settings.ACTION_SETTINGS);
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(fallback);
        }
    }

    private String getApplicationLabel(PackageManager packageManager, ResolveInfo info, String packageName) {
        try {
            CharSequence directLabel = info.loadLabel(packageManager);
            if (directLabel != null && directLabel.toString().trim().length() > 0) return directLabel.toString().trim();
            ApplicationInfo appInfo = packageManager.getApplicationInfo(packageName, 0);
            CharSequence appLabel = packageManager.getApplicationLabel(appInfo);
            if (appLabel != null && appLabel.toString().trim().length() > 0) return appLabel.toString().trim();
        } catch (Exception ignored) {
            // Fall through to package-name label.
        }
        return packageName;
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
