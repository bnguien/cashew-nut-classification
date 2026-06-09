import { API_ENDPOINTS } from "@/src/constants/endpoints";
import { DashboardStatsResponse } from "@/src/types/api";

import { apiClient } from "./client";

export async function fetchDashboardStats() {
  const { data } = await apiClient.get<DashboardStatsResponse>(API_ENDPOINTS.dashboardStats);
  return data;
}
