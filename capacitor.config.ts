/// <reference types="@capacitor-firebase/authentication" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tasktimer.app',
  appName: 'TaskLaunch',
  webDir: 'out',
  plugins: {
    FirebaseAuthentication: {
      providers: ["google.com"],
    },
  },
};

export default config;
