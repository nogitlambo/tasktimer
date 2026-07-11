package com.tasklaunch.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.core.app.NotificationCompat;

public class TaskLaunchCheckpointAlarmService extends Service {
    private static final String CHANNEL_ID = "tasklaunch-checkpoint-alarms";
    private static final int NOTIFICATION_ID = 41827;
    private static final String ACTION_START = "com.tasklaunch.app.START_CHECKPOINT_ALARM";
    private static final String ACTION_STOP = "com.tasklaunch.app.STOP_CHECKPOINT_ALARM";
    private static final long[] ONCE_DELAYS_MS = { 120L, 180L, 120L, 180L };
    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private String activeTaskId = "";
    private String soundMode = "once";
    private int onceIndex = 0;

    public static void start(Context context, Intent alarmIntent) {
        Intent serviceIntent = new Intent(context, TaskLaunchCheckpointAlarmService.class)
            .setAction(ACTION_START)
            .putExtras(alarmIntent);
        ContextCompat.startForegroundService(context, serviceIntent);
    }

    public static void stop(Context context, String taskId) {
        Intent intent = new Intent(context, TaskLaunchCheckpointAlarmService.class)
            .setAction(ACTION_STOP)
            .putExtra("taskId", taskId == null ? "" : taskId);
        try { context.startService(intent); }
        catch (Exception ignored) {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.cancel(NOTIFICATION_ID);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            String requestedTaskId = value(intent.getStringExtra("taskId"));
            if (requestedTaskId.isEmpty() || requestedTaskId.equals(activeTaskId)) stopAlarm();
            return START_NOT_STICKY;
        }
        stopPlaybackOnly();
        activeTaskId = value(intent.getStringExtra("taskId"));
        soundMode = "repeat".equals(intent.getStringExtra("soundMode")) ? "repeat" : "once";
        onceIndex = 0;
        startForeground(NOTIFICATION_ID, buildNotification(intent));
        playTone();
        return START_NOT_STICKY;
    }

    private void playTone() {
        stopPlayer();
        try {
            AssetFileDescriptor descriptor = getAssets().openFd("public/checkpoint_tone.wav");
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            player.setDataSource(descriptor.getFileDescriptor(), descriptor.getStartOffset(), descriptor.getLength());
            descriptor.close();
            player.setOnCompletionListener(ignored -> onToneComplete());
            player.prepare();
            player.start();
        } catch (Exception error) {
            stopAlarm();
        }
    }

    private void onToneComplete() {
        stopPlayer();
        if ("repeat".equals(soundMode)) {
            handler.postDelayed(this::playTone, 2000L);
            return;
        }
        if (onceIndex < ONCE_DELAYS_MS.length - 1) {
            handler.postDelayed(this::playTone, ONCE_DELAYS_MS[onceIndex++]);
        } else {
            stopAlarm();
        }
    }

    private android.app.Notification buildNotification(Intent source) {
        String taskName = value(source.getStringExtra("taskName"));
        if (taskName.isEmpty()) taskName = "Task";
        String checkpointLabel = value(source.getStringExtra("checkpointLabel"));
        if (checkpointLabel.isEmpty()) checkpointLabel = "Checkpoint reached";

        Intent openIntent = new Intent(this, TaskLaunchCheckpointAlarmActionReceiver.class)
            .setAction("com.tasklaunch.app.OPEN_CHECKPOINT_ALARM")
            .putExtra("taskId", activeTaskId);
        Intent stopIntent = new Intent(this, TaskLaunchCheckpointAlarmActionReceiver.class)
            .setAction("com.tasklaunch.app.STOP_CHECKPOINT_ALARM")
            .putExtra("taskId", activeTaskId);
        PendingIntent openPending = PendingIntent.getBroadcast(this, NOTIFICATION_ID, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stopPending = PendingIntent.getBroadcast(this, NOTIFICATION_ID + 1, stopIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(taskName)
            .setContentText(checkpointLabel)
            .setSubText("Checkpoint alarm")
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(openPending)
            .addAction(0, "Stop Sound", stopPending)
            .build();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Checkpoint Alarms", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Alarm sounds for active TaskLaunch checkpoints");
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        channel.setSound(null, null);
        channel.enableVibration(false);
        manager.createNotificationChannel(channel);
    }

    private void stopAlarm() {
        stopPlaybackOnly();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        activeTaskId = "";
    }

    private void stopPlaybackOnly() {
        handler.removeCallbacksAndMessages(null);
        stopPlayer();
    }

    private void stopPlayer() {
        if (player == null) return;
        try { player.stop(); } catch (Exception ignored) {}
        player.release();
        player = null;
    }

    private String value(String input) { return input == null ? "" : input.trim(); }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        stopPlaybackOnly();
        super.onDestroy();
    }
}
