import { API_ENDPOINTS } from "@/src/constants/endpoints";
import { ConveyorOverviewResponse, ResultListResponse, SessionControlResponse, SessionListResponse } from "@/src/types/api";
import { AlertItem, ConveyorSession } from "@/src/types/domain";

import { apiClient } from "./client";

export async function fetchSessions() {
  const { data } = await apiClient.get<SessionListResponse>(API_ENDPOINTS.sessions);
  return data;
}

export async function fetchSessionById(sessionId: number) {
  const { data } = await apiClient.get<ConveyorSession>(`${API_ENDPOINTS.sessions}${sessionId}/`);
  return data;
}

export async function fetchResults() {
  const { data } = await apiClient.get<ResultListResponse>(API_ENDPOINTS.results);
  return data;
}

export async function fetchResultsBySession(sessionId: number) {
  const { data } = await apiClient.get<ResultListResponse>(API_ENDPOINTS.results, {
    params: { session_id: sessionId },
  });
  return data;
}

export async function fetchOverview() {
  const { data } = await apiClient.get<ConveyorOverviewResponse>(API_ENDPOINTS.overview);
  return data;
}

export async function startSession() {
  const { data } = await apiClient.post<SessionControlResponse>(API_ENDPOINTS.startSession);
  return data;
}

export async function stopSession() {
  const { data } = await apiClient.post<SessionControlResponse>(API_ENDPOINTS.stopSession);
  return data;
}

export async function fetchAlerts() {
  const { data } = await apiClient.get<AlertItem[]>(API_ENDPOINTS.alerts);
  return data;
}

export async function markAlertRead(alertId: number) {
  const { data } = await apiClient.patch<AlertItem>(`${API_ENDPOINTS.alerts}${alertId}/read/`);
  return data;
}
