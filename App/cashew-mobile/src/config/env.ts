import Constants from "expo-constants";

const expoExtra = (Constants.expoConfig?.extra ?? {}) as {
  apiBaseUrl?: string;
  wsBaseUrl?: string;
};

export const AppEnv = {
  apiBaseUrl: expoExtra.apiBaseUrl ?? "http://10.0.2.2:5000",
  wsBaseUrl: expoExtra.wsBaseUrl ?? "ws://10.0.2.2:5000",
};
