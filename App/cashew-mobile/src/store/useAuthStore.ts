import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { create } from "zustand";

import { getApiBaseUrl } from "@/src/config/network-config";
import { API_ENDPOINTS } from "@/src/constants/endpoints";
import { loginApi } from "@/src/services/http/auth";
import { setSessionTokens } from "@/src/services/http/auth-session";
import { UserProfile } from "@/src/types/domain";

const ACCESS_KEY = "auth_access_token";
const REFRESH_KEY = "auth_refresh_token";
const ROLE_KEY = "auth_user_role";
const USERNAME_KEY = "auth_username";

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  setUser: (user: UserProfile | null) => void;
  hydrate: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  hydrated: false,
  loading: false,
  error: null,
  setUser: (user) => set({ user }),

  hydrate: async () => {
    try {
      const [accessToken, refreshToken, persistedRole, persistedUsername] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_KEY),
        SecureStore.getItemAsync(REFRESH_KEY),
        SecureStore.getItemAsync(ROLE_KEY),
        SecureStore.getItemAsync(USERNAME_KEY),
      ]);

      // If no token pair, always go to login.
      if (!accessToken || !refreshToken) {
        setSessionTokens(null, null);
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          hydrated: true,
        });
        return;
      }

      // Validate persisted session by refreshing access token.
      try {
        const { data } = await axios.post<{ access: string }>(
          `${getApiBaseUrl()}${API_ENDPOINTS.refreshToken}`,
          { refresh: refreshToken },
          { timeout: 5000 }
        );
        const nextAccess = data.access;
        await SecureStore.setItemAsync(ACCESS_KEY, nextAccess);
        setSessionTokens(nextAccess, refreshToken);
        const role: UserProfile["role"] =
          persistedRole === "admin" || persistedRole === "viewer" || persistedRole === "operator"
            ? persistedRole
            : "operator";
        const username = typeof persistedUsername === "string" && persistedUsername ? persistedUsername : "operator";
        set({
          accessToken: nextAccess,
          refreshToken,
          hydrated: true,
          user: { id: 0, username, full_name: username, role },
        });
      } catch {
        await Promise.all([
          SecureStore.deleteItemAsync(ACCESS_KEY),
          SecureStore.deleteItemAsync(REFRESH_KEY),
          SecureStore.deleteItemAsync(ROLE_KEY),
          SecureStore.deleteItemAsync(USERNAME_KEY),
        ]);
        setSessionTokens(null, null);
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          hydrated: true,
        });
      }
    } catch {
      setSessionTokens(null, null);
      set({
        accessToken: null,
        refreshToken: null,
        user: null,
        hydrated: true,
      });
    }
  },

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      if (!username.trim() || !password.trim()) {
        set({ loading: false, error: "Vui lòng nhập đầy đủ thông tin." });
        return false;
      }
      // DEBUG: log URL đang gọi
      const { getApiBaseUrl } = await import("@/src/config/network-config");
      console.log("[LOGIN] Calling API at:", getApiBaseUrl() + "/api/auth/login/");

      const response = await loginApi(username, password);
      console.log("[LOGIN] Response OK:", response);

      const accessToken = response.access;
      const refreshToken = response.refresh;
      await Promise.all([
        SecureStore.setItemAsync(ACCESS_KEY, accessToken),
        SecureStore.setItemAsync(REFRESH_KEY, refreshToken),
        SecureStore.setItemAsync(ROLE_KEY, response.user.role),
        SecureStore.setItemAsync(USERNAME_KEY, response.user.username),
      ]);
      setSessionTokens(accessToken, refreshToken);
      set({
        accessToken,
        refreshToken,
        user: {
          id: response.user.id,
          username: response.user.username,
          full_name: response.user.full_name,
          role: response.user.role,
        },
        loading: false,
        error: null,
      });
      return true;
    } catch (err: unknown) {
      // DEBUG: log lỗi chi tiết
      if (err && typeof err === "object" && "message" in err) {
        console.error("[LOGIN] Error:", (err as { message: string }).message);
      }
      if (err && typeof err === "object" && "response" in err) {
        const e = err as { response?: { status?: number; data?: unknown } };
        console.error("[LOGIN] HTTP Status:", e.response?.status, "Data:", JSON.stringify(e.response?.data));
      }
      if (err && typeof err === "object" && "code" in err) {
        console.error("[LOGIN] Error code:", (err as { code: string }).code);
      }
      set({ loading: false, error: "Đăng nhập thất bại. Vui lòng thử lại." });
      return false;
    }
  },

  logout: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
      SecureStore.deleteItemAsync(ROLE_KEY),
      SecureStore.deleteItemAsync(USERNAME_KEY),
    ]);
    setSessionTokens(null, null);
    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      error: null,
    });
    if (!get().hydrated) {
      set({ hydrated: true });
    }
  },
}));
