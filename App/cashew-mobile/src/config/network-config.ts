import { AppEnv } from "@/src/config/env";

let apiBaseUrl = AppEnv.apiBaseUrl;
let wsBaseUrl = AppEnv.wsBaseUrl;

export function getApiBaseUrl() {
  return apiBaseUrl;
}

export function getWsBaseUrl() {
  return wsBaseUrl;
}

export function setBaseUrls(nextApiBaseUrl: string, nextWsBaseUrl: string) {
  apiBaseUrl = nextApiBaseUrl;
  wsBaseUrl = nextWsBaseUrl;
}

export function buildBaseUrls(ip: string, port: string) {
  const cleanIp = ip.trim();
  const cleanPort = port.trim();
  return {
    apiBaseUrl: `http://${cleanIp}:${cleanPort}`,
    wsBaseUrl: `ws://${cleanIp}:${cleanPort}`,
  };
}
