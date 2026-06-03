import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { AppEnv } from "@/src/config/env";
import { buildBaseUrls, setBaseUrls } from "@/src/config/network-config";
import { STORAGE_KEYS } from "@/src/constants/storage";

type ServerConfigState = {
  ip: string;
  port: string;
  loaded: boolean;
  load: () => Promise<void>;
  save: (ip: string, port: string) => Promise<void>;
};

function inferDefaultIpPort() {
  try {
    const url = new URL(AppEnv.apiBaseUrl);
    return { ip: url.hostname, port: url.port || "5000" };
  } catch {
    return { ip: "10.0.2.2", port: "5000" };
  }
}

const defaults = inferDefaultIpPort();

export const useServerConfigStore = create<ServerConfigState>((set) => ({
  ip: defaults.ip,
  port: defaults.port,
  loaded: false,

  load: async () => {
    try {
      const [savedIp, savedPort] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.serverIp),
        AsyncStorage.getItem(STORAGE_KEYS.serverPort),
      ]);
      const ip = savedIp?.trim() || defaults.ip;
      const port = savedPort?.trim() || defaults.port;
      const urls = buildBaseUrls(ip, port);
      setBaseUrls(urls.apiBaseUrl, urls.wsBaseUrl);
      set({ ip, port, loaded: true });
    } catch {
      const urls = buildBaseUrls(defaults.ip, defaults.port);
      setBaseUrls(urls.apiBaseUrl, urls.wsBaseUrl);
      set({ ip: defaults.ip, port: defaults.port, loaded: true });
    }
  },

  save: async (ip, port) => {
    const nextIp = ip.trim();
    const nextPort = port.trim();
    const urls = buildBaseUrls(nextIp, nextPort);
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.serverIp, nextIp),
      AsyncStorage.setItem(STORAGE_KEYS.serverPort, nextPort),
      AsyncStorage.setItem(STORAGE_KEYS.serverBaseUrl, urls.apiBaseUrl),
      AsyncStorage.setItem(STORAGE_KEYS.websocketBaseUrl, urls.wsBaseUrl),
    ]);
    setBaseUrls(urls.apiBaseUrl, urls.wsBaseUrl);
    set({ ip: nextIp, port: nextPort });
  },
}));
