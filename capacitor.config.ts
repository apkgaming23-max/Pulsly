import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "se.pulsly.app",
  appName: "Pulsly",
  webDir: "dist",

  server: {
    androidScheme: "https"
  },

  android: {
    allowMixedContent: false
  },

  ios: {
    contentInset: "automatic"
  }
};

export default config;
