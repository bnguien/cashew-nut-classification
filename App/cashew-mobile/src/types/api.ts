import { ClassifyResult, ConveyorSession } from "./domain";

export type LoginResponse = {
  access: string;
  refresh: string;
  user: {
    id: number;
    username: string;
    full_name: string;
    role: "admin" | "operator" | "viewer";
  };
};

export type AdminUserItem = {
  id: number;
  username: string;
  role: "admin" | "operator" | "viewer";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type DashboardStatsResponse = {
  sessions: number;
  logs: number;
  users: number;
  total_count: number;
  whole_count: number;
  broken_count: number;
  defect_count: number;
  defect_rate: number;
  session_by_status: { status: string; total: number }[];
};

export type SessionListResponse = ConveyorSession[];
export type ResultListResponse = ClassifyResult[];

export type ConveyorOverviewResponse = {
  is_running: boolean;
  running_session_id: number | null;
  latest_result: ClassifyResult | null;
  unread_alerts: number;
  esp_connected: boolean;
};

export type SessionControlResponse = {
  session?: ConveyorSession;
  detail?: string;
  ui_hint?: {
    esp_active: boolean;
    show_popup: boolean;
    message: string;
  };
};

export type ConveyorRealtimeMessage = {
  type:
    | "classify_result"
    | "session_update"
    | "session_started"
    | "session_stopped"
    | "alert"
    | "esp_status"
    | "esp_control_request"
    | "esp_control_decision"
    | "mobile_control_signal"
    | "mobile_control_trigger"
    | "esp_port_rx";
  data: unknown;
};
