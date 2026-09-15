package com.tasklaunch.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "TaskLaunchFileExport")
public class TaskLaunchFileExportPlugin extends Plugin {
    private volatile boolean saveInProgress;

    @PluginMethod
    public void saveJson(PluginCall call) {
        String filename = call.getString("filename");
        String text = call.getString("text");
        if (filename == null || filename.isEmpty() || text == null) {
            call.reject("A filename and JSON content are required.");
            return;
        }
        if (saveInProgress) {
            call.reject("A file save is already in progress.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        saveInProgress = true;
        try {
            startActivityForResult(call, intent, "saveJsonResult");
        } catch (Exception error) {
            saveInProgress = false;
            call.reject("Could not open the file save dialog.", error);
        }
    }

    @ActivityCallback
    private void saveJsonResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            saveInProgress = false;
            return;
        }
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            saveInProgress = false;
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            saveInProgress = false;
            call.reject("No file location was returned.");
            return;
        }
        // File providers can be remote; keep their I/O off the UI thread.
        getBridge().execute(() -> {
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (stream == null) throw new java.io.IOException("Could not open the selected file.");
                stream.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
            } catch (Exception error) {
                saveInProgress = false;
                call.reject("Could not save the JSON file. Please try another location.", error);
                return;
            }
            saveInProgress = false;
            JSObject response = new JSObject();
            response.put("cancelled", false);
            call.resolve(response);
        });
    }
}
