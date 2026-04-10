package com.tasklaunch.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.BridgeActivity;
import io.capawesome.capacitorjs.plugins.firebase.authentication.FirebaseAuthenticationPlugin;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String STORAGE_KEY = "taskticker_tasks_v1";
    private static final String PENDING_PUSH_TASK_ID_KEY = STORAGE_KEY + ":pendingPushTaskId";
    private static final String PENDING_PUSH_ACTION_KEY = STORAGE_KEY + ":pendingPushAction";
    private static final String LAST_NATIVE_PUSH_DISPATCH_KEY = STORAGE_KEY + ":lastNativePushDispatch";
    private static final String PENDING_PUSH_TASK_EVENT = "tasktimer:pendingTaskJump";
    private final Handler pushIntentHandler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(FirebaseAuthenticationPlugin.class);
        super.onCreate(savedInstanceState);
        deliverPushIntentToWeb(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        deliverPushIntentToWeb(intent);
    }

    private void deliverPushIntentToWeb(Intent intent) {
        if (intent == null) return;

        final String taskId = valueOrEmpty(intent.getStringExtra("taskId"));
        if (taskId.isEmpty()) return;
        final String route = valueOrEmpty(intent.getStringExtra("route")).isEmpty()
            ? "/tasklaunch"
            : valueOrEmpty(intent.getStringExtra("route"));
        final String actionId = valueOrEmpty(intent.getStringExtra("tasktimerActionId")).isEmpty()
            ? "default"
            : valueOrEmpty(intent.getStringExtra("tasktimerActionId"));

        try {
            JSONObject payload = new JSONObject();
            payload.put("taskId", taskId);
            payload.put("route", route);
            payload.put("actionId", actionId);
            final String dispatchNonce = buildDispatchNonce(intent, taskId, actionId);
            payload.put("dispatchNonce", dispatchNonce);

            String taskIdJson = JSONObject.quote(taskId);
            String payloadJson = JSONObject.quote(payload.toString());
            String eventNameJson = JSONObject.quote(PENDING_PUSH_TASK_EVENT);
            String dispatchNonceJson = JSONObject.quote(dispatchNonce);
            String script =
                "(function() {" +
                    "try {" +
                        "var dispatchNonce = " + dispatchNonceJson + ";" +
                        "var lastDispatch = window.localStorage.getItem(" + JSONObject.quote(LAST_NATIVE_PUSH_DISPATCH_KEY) + ") || \"\";" +
                        "if (dispatchNonce && lastDispatch === dispatchNonce) return;" +
                        "window.localStorage.setItem(" + JSONObject.quote(PENDING_PUSH_TASK_ID_KEY) + ", " + taskIdJson + ");" +
                        "window.localStorage.setItem(" + JSONObject.quote(PENDING_PUSH_ACTION_KEY) + ", " + payloadJson + ");" +
                        "if (dispatchNonce) window.localStorage.setItem(" + JSONObject.quote(LAST_NATIVE_PUSH_DISPATCH_KEY) + ", dispatchNonce);" +
                        "window.dispatchEvent(new CustomEvent(" + eventNameJson + ", { detail: JSON.parse(" + payloadJson + ") }));" +
                    "} catch (e) {}" +
                "})();";

            if (bridge != null && bridge.getWebView() != null) {
                dispatchScriptWithRetry(script, 0L);
                dispatchScriptWithRetry(script, 600L);
                dispatchScriptWithRetry(script, 1500L);
            }
        } catch (Exception ignored) {
            // Ignore push-intent bridge failures so the activity still opens normally.
        }
    }

    private void dispatchScriptWithRetry(String script, long delayMs) {
        if (script == null) return;
        pushIntentHandler.postDelayed(() -> {
            try {
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().evaluateJavascript(script, null);
                }
            } catch (Exception ignored) {
                // Ignore transient webview readiness failures.
            }
        }, Math.max(0L, delayMs));
    }

    private String buildDispatchNonce(Intent intent, String taskId, String actionId) {
        String messageId = valueOrEmpty(intent == null ? null : intent.getStringExtra("google.message_id"));
        String notificationId = "";
        try {
            notificationId = String.valueOf(intent == null ? 0 : intent.getIntExtra("tasktimerNotificationId", 0));
        } catch (Exception ignored) {
            notificationId = "";
        }
        String dueAtMs = "";
        try {
            dueAtMs = String.valueOf(intent == null ? 0L : intent.getLongExtra("tasktimerDueAtMs", 0L));
        } catch (Exception ignored) {
            dueAtMs = "";
        }
        String nonceSource = String.join("|",
            valueOrEmpty(messageId),
            valueOrEmpty(taskId),
            valueOrEmpty(actionId),
            valueOrEmpty(notificationId),
            valueOrEmpty(dueAtMs)
        );
        if (nonceSource.trim().isEmpty()) {
            nonceSource = "push|" + System.currentTimeMillis();
        }
        return nonceSource;
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
