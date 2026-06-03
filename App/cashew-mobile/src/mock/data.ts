import { AlertItem, ClassifyResult, ConveyorSession } from "@/src/types/domain";

export const mockResults: ClassifyResult[] = [
  {
    id: 142,
    session: 6,
    image_path: "https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?w=200",
    grade: "whole",
    confidence: 0.91,
    created_at: "2025-01-15T08:32:11Z",
  },
  {
    id: 141,
    session: 6,
    image_path: "https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?w=200",
    grade: "broken",
    confidence: 0.88,
    created_at: "2025-01-15T08:31:22Z",
  },
  {
    id: 140,
    session: 6,
    image_path: "https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?w=200",
    grade: "defect",
    confidence: 0.79,
    created_at: "2025-01-15T08:31:02Z",
  },
];

export const mockSessions: ConveyorSession[] = [
  {
    id: 6,
    status: "completed",
    started_at: "2025-01-15T08:00:00Z",
    ended_at: "2025-01-15T09:15:00Z",
    total_count: 284,
    whole_count: 201,
    broken_count: 52,
    defect_count: 31,
  },
  {
    id: 5,
    status: "running",
    started_at: "2025-01-14T07:40:00Z",
    ended_at: null,
    total_count: 156,
    whole_count: 114,
    broken_count: 25,
    defect_count: 17,
  },
];

export const mockAlerts: AlertItem[] = [
  {
    id: 1,
    alert_type: "defect_threshold",
    message: "Tỉ lệ hạt hỏng vượt ngưỡng 20%.",
    is_read: false,
    created_at: "2025-01-15T08:35:00Z",
  },
  {
    id: 2,
    alert_type: "connection_lost",
    message: "ESP32 mất kết nối tạm thời.",
    is_read: true,
    created_at: "2025-01-15T08:12:00Z",
  },
];
