import { useEffect } from "react";
import { router } from "expo-router";

import { getWsBaseUrl } from "@/src/config/network-config";
import { createConveyorSocket } from "@/src/services/ws/conveyorSocket";
import { useAlertStore } from "@/src/store/useAlertStore";
import { useAuthStore } from "@/src/store/useAuthStore";
import { useConveyorStore } from "@/src/store/useConveyorStore";
import { useServerConfigStore } from "@/src/store/useServerConfigStore";
import { AlertItem, ClassifyResult } from "@/src/types/domain";

const HEARTBEAT_LOST_TIMEOUT_MS = 12000;

export function useRealtimeConveyor() {
  const pushResult = useConveyorStore((state) => state.pushResult);
  const setConnection = useConveyorStore((state) => state.setConnection);
  const setRunningState = useConveyorStore((state) => state.setRunningState);
  const setWaitingApproval = useConveyorStore((state) => state.setWaitingApproval);
  const setEspPopup = useConveyorStore((state) => state.setEspPopup);
  const setCurrentSessionId = useConveyorStore((state) => state.setCurrentSessionId);
  const pushRealtimeNotice = useConveyorStore((state) => state.pushRealtimeNotice);
  const pushAlert = useAlertStore((state) => state.pushAlert);
  const accessToken = useAuthStore((state) => state.accessToken);
  const wsPort = useServerConfigStore((state) => state.port);
  const wsIp = useServerConfigStore((state) => state.ip);

  useEffect(() => {
    if (!accessToken) return;

    let active = true;
    let retryCount = 0;
    let socket: WebSocket | null = null;
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

    const resetHeartbeatTimer = () => {
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      heartbeatTimer = setTimeout(() => {
        if (!active) return;
        setConnection(false);
        setRunningState(false);
        setWaitingApproval(false);
        setEspPopup(true, "Không nhận heartbeat từ ESP trong 12 giây. Đã chuyển sang màn hình cảnh báo.");
        pushRealtimeNotice("Mất heartbeat ESP > 12s. Tự động chuyển sang tab Cảnh báo.");
        router.replace("/(tabs)/alerts");
      }, HEARTBEAT_LOST_TIMEOUT_MS);
    };

    const connect = () => {
      if (!active) return;
      socket = createConveyorSocket(getWsBaseUrl(), accessToken, (message) => {
        // --- Session lifecycle (main branch feature) ---
        if (message.type === "session_started") {
          const payload = message.data as { session_id?: number; started_by?: string };
          setRunningState(true);
          setWaitingApproval(false);
          if (payload.session_id != null) {
            setCurrentSessionId(payload.session_id);
          }
          pushRealtimeNotice(
            `Phiên #${payload.session_id ?? "?"} đã bắt đầu${payload.started_by ? ` bởi ${payload.started_by}` : ""}.`
          );
          return;
        }
        if (message.type === "session_stopped") {
          const payload = message.data as { session_id?: number; stopped_by?: string };
          setRunningState(false);
          setWaitingApproval(false);
          pushRealtimeNotice(
            `Phiên #${payload.session_id ?? "?"} đã dừng${payload.stopped_by ? ` bởi ${payload.stopped_by}` : ""}.`
          );
          return;
        }

        // --- Realtime classification results ---
        if (message.type === "classify_result") {
          pushResult(message.data as ClassifyResult);
          pushRealtimeNotice("Nhận classify_result realtime.");
          return;
        }

        // --- Alerts ---
        if (message.type === "alert") {
          pushAlert(message.data as AlertItem);
          pushRealtimeNotice("Nhận alert realtime.");
          return;
        }

        // --- ESP hardware status ---
        if (message.type === "esp_status") {
          const payload = message.data as {
            esp_connected?: boolean;
            is_running?: boolean;
            source?: string;
          };
          if (typeof payload.esp_connected === "boolean") {
            setConnection(payload.esp_connected);
            if (!payload.esp_connected) {
              setRunningState(false);
            }
          }
          if (payload.source === "heartbeat") {
            setRunningState(true);
            resetHeartbeatTimer();
          } else if (typeof payload.is_running === "boolean") {
            setRunningState(payload.is_running);
          }
          pushRealtimeNotice(
            `ESP status: ${payload.esp_connected ? "connected" : "disconnected"}${
              typeof payload.is_running === "boolean" ? `, running=${payload.is_running}` : ""
            }.`
          );
          return;
        }

        // --- Legacy approval flow (kept for compatibility) ---
        if (message.type === "esp_control_request") {
          const payload = message.data as { action?: string };
          setWaitingApproval(true);
          setEspPopup(true, `Yêu cầu ${payload.action ?? "control"} đã gửi lên web, đang chờ Accept.`);
          pushRealtimeNotice(`Nhận yêu cầu ${payload.action ?? "control"} chờ web Accept.`);
          return;
        }
        if (message.type === "esp_control_decision") {
          const payload = message.data as { action?: string; accepted?: boolean };
          setWaitingApproval(false);
          if (payload.accepted) {
            if (payload.action === "start") {
              setRunningState(true);
            } else if (payload.action === "stop") {
              setRunningState(false);
            }
          }
          pushRealtimeNotice(
            `Web ${payload.accepted ? "Accept" : "Reject"} ${payload.action ?? "yêu cầu"}.`
          );
          return;
        }

        // --- MQTT pass-through signals ---
        if (message.type === "mobile_control_signal" || message.type === "mobile_control_trigger") {
          const payload = message.data as {
            command?: string;
            session_id?: number | null;
            source?: string;
          };
          if (payload.command === "start") {
            setRunningState(true);
            setWaitingApproval(false);
          } else if (payload.command === "stop") {
            setRunningState(false);
            setWaitingApproval(false);
          }
          pushRealtimeNotice(
            `MQTT ${payload.command ?? "unknown"} (session=${payload.session_id ?? "n/a"}, source=${payload.source ?? "n/a"}).`
          );
          return;
        }
        if (message.type === "esp_port_rx") {
          const payload = message.data as { topic?: string; payload?: { command?: string } };
          if (payload.topic === "conveyor/command") {
            const cmd = payload.payload?.command;
            if (cmd === "start") {
              setRunningState(true);
              setWaitingApproval(false);
              pushRealtimeNotice("Nhận conveyor/command start từ MQTT.");
            } else if (cmd === "stop") {
              setRunningState(false);
              setWaitingApproval(false);
              pushRealtimeNotice("Nhận conveyor/command stop từ MQTT.");
            }
          }
        }
      });

      socket.onopen = () => {
        retryCount = 0;
        setConnection(true);
        resetHeartbeatTimer();
      };

      socket.onclose = () => {
        setConnection(false);
        if (heartbeatTimer) {
          clearTimeout(heartbeatTimer);
          heartbeatTimer = null;
        }
        if (!active) return;
        const delay = Math.min(30000, 1000 * 2 ** retryCount);
        retryCount += 1;
        setTimeout(connect, delay);
      };

      socket.onerror = () => {
        setConnection(false);
      };
    };

    connect();

    return () => {
      active = false;
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      socket?.close();
    };
  }, [accessToken, pushAlert, pushResult, pushRealtimeNotice, setConnection, setCurrentSessionId, setRunningState, setWaitingApproval, setEspPopup, wsIp, wsPort]);
}
