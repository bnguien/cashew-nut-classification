import { WS_ENDPOINTS } from "@/src/constants/endpoints";
import { ConveyorRealtimeMessage } from "@/src/types/api";

export function createConveyorSocket(
  baseUrl: string,
  accessToken: string | null,
  onMessage: (payload: ConveyorRealtimeMessage) => void
) {
  const tokenQuery = accessToken ? `?token=${encodeURIComponent(accessToken)}` : "";
  const ws = new WebSocket(`${baseUrl}${WS_ENDPOINTS.conveyor}${tokenQuery}`);
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data) as ConveyorRealtimeMessage);
    } catch {
      // Ignore malformed socket payload for now.
    }
  };
  return ws;
}
