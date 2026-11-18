import type { CapacitorConfig } from '@capacitor/cli';

const liveUrl = process.env.CAP_LIVE_URL;

const config: CapacitorConfig = {
  appId: 'com.listtube.app',
  appName: 'ListTube',
  webDir: 'dist',
  ...(liveUrl
    ? {
        server: {
          url: liveUrl,
          cleartext: true,
        },
      }
    : {}),
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
