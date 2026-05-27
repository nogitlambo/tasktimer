package com.tasklaunch.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

public class TaskLaunchAppBlockerService extends Service {
    public static final String ACTION_START = "com.tasklaunch.app.APP_BLOCKER_START";
    public static final String ACTION_STOP = "com.tasklaunch.app.APP_BLOCKER_STOP";
    public static final String EXTRA_BLOCKED_PACKAGES_JSON = "blockedPackagesJson";
    public static final String EXTRA_TASK_ID = "taskId";
    public static final String EXTRA_TASK_NAME = "taskName";

    private static final String CHANNEL_ID = "tasklaunch-app-blocking";
    private static final int NOTIFICATION_ID = 24041;
    private static final long POLL_INTERVAL_MS = 1000L;
    private static volatile boolean active = false;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Set<String> blockedPackages = Collections.emptySet();
    private String taskId = "";
    private String taskName = "Focus Mode";
    private WindowManager windowManager;
    private View overlayView;
    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            if (!active) return;
            maybeBlockForegroundApp();
            handler.postDelayed(this, POLL_INTERVAL_MS);
        }
    };

    public static boolean isBlockingActive() {
        return active;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? "" : valueOrEmpty(intent.getAction());
        if (ACTION_STOP.equals(action)) {
            stopBlocking();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_START.equals(action)) {
            blockedPackages = parseBlockedPackages(intent.getStringExtra(EXTRA_BLOCKED_PACKAGES_JSON));
            taskId = valueOrEmpty(intent.getStringExtra(EXTRA_TASK_ID));
            taskName = valueOrEmpty(intent.getStringExtra(EXTRA_TASK_NAME));
            if (taskName.isEmpty()) taskName = "Focus Mode";
            if (blockedPackages.isEmpty()) {
                stopBlocking();
                stopSelf();
                return START_NOT_STICKY;
            }
            active = true;
            startForegroundNotification();
            handler.removeCallbacks(pollRunnable);
            handler.post(pollRunnable);
            return START_STICKY;
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        stopBlocking();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startForegroundNotification() {
        ensureNotificationChannel();
        Intent openIntent = buildOpenTaskLaunchIntent();
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            NOTIFICATION_ID,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("Focus blocking active")
            .setContentText(taskName)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setSilent(true)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(pendingIntent)
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Intent buildOpenTaskLaunchIntent() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (!taskId.isEmpty()) intent.putExtra("taskId", taskId);
        intent.putExtra("route", "/tasklaunch");
        intent.putExtra("tasktimerActionId", "default");
        return intent;
    }

    private void maybeBlockForegroundApp() {
        String packageName = getForegroundPackageName();
        if (packageName.isEmpty() || !blockedPackages.contains(packageName)) {
            hideOverlay();
            return;
        }
        showOverlay();
    }

    private String getForegroundPackageName() {
        try {
            UsageStatsManager manager = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
            if (manager == null) return "";
            long now = System.currentTimeMillis();
            UsageEvents events = manager.queryEvents(now - 5000L, now);
            UsageEvents.Event event = new UsageEvents.Event();
            String foregroundPackage = "";
            long foregroundTs = 0L;
            while (events.hasNextEvent()) {
                events.getNextEvent(event);
                int type = event.getEventType();
                if ((type == UsageEvents.Event.MOVE_TO_FOREGROUND || type == UsageEvents.Event.ACTIVITY_RESUMED) &&
                    event.getTimeStamp() >= foregroundTs) {
                    foregroundTs = event.getTimeStamp();
                    foregroundPackage = valueOrEmpty(event.getPackageName());
                }
            }
            return foregroundPackage;
        } catch (Exception ignored) {
            return "";
        }
    }

    private void showOverlay() {
        if (overlayView != null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) return;
        windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        if (windowManager == null) return;

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(40, 40, 40, 40);
        root.setBackgroundColor(0xF20D0F13);

        TextView title = new TextView(this);
        title.setText("Blocked during Focus Mode");
        title.setTextColor(0xFFF1FFD0);
        title.setTextSize(22);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, 0, 0, 18);
        root.addView(title);

        TextView body = new TextView(this);
        body.setText("Return to TaskLaunch to keep focusing.");
        body.setTextColor(0xCCEEF4FA);
        body.setTextSize(15);
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, 0, 0, 26);
        root.addView(body);

        Button button = new Button(this);
        button.setText("Return to Focus Mode");
        button.setOnClickListener((view) -> {
            hideOverlay();
            startActivity(buildOpenTaskLaunchIntent());
        });
        root.addView(button);

        int overlayType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN |
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.CENTER;
        try {
            windowManager.addView(root, params);
            overlayView = root;
        } catch (Exception ignored) {
            overlayView = null;
        }
    }

    private void hideOverlay() {
        if (overlayView == null || windowManager == null) return;
        try {
            windowManager.removeView(overlayView);
        } catch (Exception ignored) {
            // Ignore stale overlay removal failures.
        } finally {
            overlayView = null;
        }
    }

    private void stopBlocking() {
        active = false;
        handler.removeCallbacks(pollRunnable);
        hideOverlay();
        stopForeground(true);
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null || notificationManager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "TaskLaunch App Blocking",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Shown while Focus Mode app blocking is active");
        channel.setSound(null, null);
        channel.enableVibration(false);
        notificationManager.createNotificationChannel(channel);
    }

    private Set<String> parseBlockedPackages(String rawJson) {
        Set<String> packages = new HashSet<>();
        try {
            JSONArray array = new JSONArray(valueOrEmpty(rawJson));
            for (int i = 0; i < array.length(); i++) {
                String packageName = valueOrEmpty(array.optString(i));
                if (!packageName.isEmpty()) packages.add(packageName);
            }
        } catch (Exception ignored) {
            // Invalid package payload means no active block list.
        }
        return packages;
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
