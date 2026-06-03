import axios, { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";

import { getApiBaseUrl } from "@/src/config/network-config";
import { API_ENDPOINTS } from "@/src/constants/endpoints";

import { getAccessToken, getRefreshToken, setSessionTokens } from "./auth-session";

export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 10000,
});

// IMPORTANT: Luôn cập nhật baseURL mới nhất trước mỗi request.
// Vì apiClient được tạo 1 lần lúc khởi động, trước khi AsyncStorage load xong IP/port đúng.
apiClient.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl();
  const access = getAccessToken();
  if (access) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});

let isRefreshing = false;
let pendingQueue: ((token: string | null) => void)[] = [];

function processQueue(token: string | null) {
  pendingQueue.forEach((cb) => cb(token));
  pendingQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (!originalRequest || error.response?.status !== 401 || originalRequest._retry) {
      throw error;
    }

    const refresh = getRefreshToken();
    if (!refresh) {
      throw error;
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push((token) => {
          if (!token) {
            reject(error);
            return;
          }
          originalRequest.headers = originalRequest.headers ?? ({} as AxiosRequestConfig["headers"]);
          originalRequest.headers.Authorization = `Bearer ${token}`;
          apiClient.defaults.baseURL = getApiBaseUrl();
          resolve(apiClient(originalRequest));
        });
      });
    }

    isRefreshing = true;
    originalRequest._retry = true;

    try {
      const { data } = await axios.post(`${getApiBaseUrl()}${API_ENDPOINTS.refreshToken}`, { refresh });
      const newAccess = data.access as string;
      setSessionTokens(newAccess, refresh);
      processQueue(newAccess);
      originalRequest.headers = originalRequest.headers ?? ({} as AxiosRequestConfig["headers"]);
      originalRequest.headers.Authorization = `Bearer ${newAccess}`;
      apiClient.defaults.baseURL = getApiBaseUrl();
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(null);
      throw refreshError;
    } finally {
      isRefreshing = false;
    }
  }
);
