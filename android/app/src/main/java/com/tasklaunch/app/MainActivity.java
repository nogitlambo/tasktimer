package com.tasklaunch.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import io.capawesome.capacitorjs.plugins.firebase.authentication.FirebaseAuthenticationPlugin;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String STORAGE_KEY = "taskticker_tasks_v1";
    private static final String PENDING_PUSH_TASK_ID_KEY = STORAGE_KEY + ":pendingPushTaskId";
    private static final String PENDING_PUSH_ACTION_KEY = STORAGE_KEY + ":pendingPushAction";
    private static final String PENDING_PUSH_TASK_EVENT = "tasktimer:pendingTaskJump";

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

            String taskIdJson = JSONObject.quote(taskId);
            String payloadJson = JSONObject.quote(payload.toString());
            String eventNameJson = JSONObject.quote(PENDING_PUSH_TASK_EVENT);
            String script =
                "(function() {" +
                    "try {" +
                        "window.localStorage.setItem(" + JSONObject.quote(PENDING_PUSH_TASK_ID_KEY) + ", " + taskIdJson + ");" +
                        "window.localStorage.setItem(" + JSONObject.quote(PENDING_PUSH_ACTION_KEY) + ", " + payloadJson + ");" +
                        "window.dispatchEvent(new CustomEvent(" + eventNameJson + ", { detail: JSON.parse(" + payloadJson + ") }));" +
                    "} catch (e) {}" +
                "})();";

            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(script, null));
            }
        } catch (Exception ignored) {
            // Ignore push-intent bridge failures so the activity still opens normally.
        }
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
