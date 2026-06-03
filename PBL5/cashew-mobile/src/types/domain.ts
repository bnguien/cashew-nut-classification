export type Grade = "whole" | "broken" | "defect";

export type UserProfile = {
  id: number;
  username: string;
  full_name: string;
  role: "admin" | "operator" | "viewer";
};

export type ConveyorSession = {
  id: number;
  status: string;
  started_at: string;
  ended_at: string | null;
  total_count: number;
  whole_count: number;
  broken_count: number;
  defect_count: number;
};

export type ClassifyResult = {
  id: number;
  session: number | ConveyorSession;
  image_path: string;
  image_url: string | null;
  labeled_image_url?: string | null;
  grade: Grade;
  confidence: number;
  created_at: string;
};

export type AlertType = "defect_threshold" | "connection_lost" | "system_error" | "conveyor_stop";

export type AlertItem = {
  id: number;
  alert_type: AlertType;
  message: string;
  is_read: boolean;
  created_at: string;
};
