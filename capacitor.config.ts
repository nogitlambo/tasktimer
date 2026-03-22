/// <reference types="@capacitor-firebase/authentication" />
/// <reference types="@capacitor/push-notifications" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tasklaunch.app',
  appName: 'TaskLaunch',
  webDir: 'out',
  plugins: {
    FirebaseAuthentication: {
      providers: ["google.com"],
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
