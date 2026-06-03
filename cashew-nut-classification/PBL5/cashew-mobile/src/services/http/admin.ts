import { API_ENDPOINTS } from "@/src/constants/endpoints";
import { AdminUserItem } from "@/src/types/api";

import { apiClient } from "./client";

type UpsertPayload = {
  username: string;
  role: "admin" | "operator" | "viewer";
  is_active: boolean;
  password?: string;
};

export async function fetchAdminUsers() {
  const { data } = await apiClient.get<AdminUserItem[]>(API_ENDPOINTS.adminUsers);
  return data;
}

export async function createAdminUser(payload: UpsertPayload) {
  const { data } = await apiClient.post<AdminUserItem>(API_ENDPOINTS.adminUsers, payload);
  return data;
}

export async function updateAdminUser(id: number, payload: UpsertPayload) {
  const { data } = await apiClient.patch<AdminUserItem>(`${API_ENDPOINTS.adminUsers}${id}/`, payload);
  return data;
}

export async function deleteAdminUser(id: number) {
  await apiClient.delete(`${API_ENDPOINTS.adminUsers}${id}/`);
}
