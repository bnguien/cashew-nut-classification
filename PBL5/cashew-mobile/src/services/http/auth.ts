import { API_ENDPOINTS } from "@/src/constants/endpoints";
import { LoginResponse } from "@/src/types/api";

import { apiClient } from "./client";

export async function loginApi(username: string, password: string) {
  const { data } = await apiClient.post<LoginResponse>(API_ENDPOINTS.login, { username, password });
  return data;
}
