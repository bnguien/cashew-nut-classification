import { create } from "zustand";

import { ClassifyResult, ConveyorSession } from "@/src/types/domain";

export type RealtimeNotice = {
  id: string;
  message: string;
  createdAt: string;
};

type ConveyorState = {
  loading: boolean;
  isRunning: boolean;
  espConnected: boolean;
  currentSessionId: number | null;
  wholeCount: number;
  brokenCount: number;
  defectCount: number;
  lastResult: ClassifyResult | null;
  espPopupVisible: boolean;
  espPopupMessage: string;
  waitingApproval: boolean;
  sessions: ConveyorSession[];
  feedItems: ClassifyResult[];
  realtimeNotices: RealtimeNotice[];
  setSessions: (sessions: ConveyorSession[]) => void;
  setLoading: (loading: boolean) => void;
  setCurrentSessionId: (id: number | null) => void;
  hydrateOverview: (payload: {
    is_running: boolean;
    running_session_id: number | null;
    esp_connected: boolean;
    latest_result: ClassifyResult | null;
  }) => void;
  setFeedItems: (items: ClassifyResult[]) => void;
  setCounters: (whole: number, broken: number, defect: number) => void;
  setEspPopup: (visible: boolean, message?: string) => void;
  setWaitingApproval: (waiting: boolean) => void;
  setConnection: (connected: boolean) => void;
  setRunningState: (running: boolean) => void;
  pushRealtimeNotice: (message: string) => void;
  clearRealtimeNotices: () => void;
  startConveyor: () => void;
  stopConveyor: () => void;
  pushResult: (result: ClassifyResult) => void;
};

export const useConveyorStore = create<ConveyorState>((set) => ({
  loading: false,
  isRunning: false,
  espConnected: false,
  currentSessionId: null,
  wholeCount: 0,
  brokenCount: 0,
  defectCount: 0,
  lastResult: null,
  espPopupVisible: false,
  espPopupMessage: "",
  waitingApproval: false,
  sessions: [],
  feedItems: [],
  realtimeNotices: [],
  setSessions: (sessions) => set({ sessions }),
  setLoading: (loading) => set({ loading }),
  setCurrentSessionId: (currentSessionId) => set({ currentSessionId }),
  hydrateOverview: (payload) =>
    set({
      isRunning: payload.is_running,
      currentSessionId: payload.running_session_id,
      espConnected: payload.esp_connected,
      lastResult: payload.latest_result,
    }),
  setFeedItems: (feedItems) => set({ feedItems, lastResult: feedItems[0] ?? null }),
  setCounters: (wholeCount, brokenCount, defectCount) => set({ wholeCount, brokenCount, defectCount }),
  setEspPopup: (espPopupVisible, espPopupMessage) =>
    set((state) => ({
      espPopupVisible,
      espPopupMessage: espPopupMessage ?? state.espPopupMessage,
    })),
  setWaitingApproval: (waitingApproval) => set({ waitingApproval }),
  setConnection: (espConnected) => set({ espConnected }),
  setRunningState: (isRunning) => set({ isRunning }),
  pushRealtimeNotice: (message) =>
    set((state) => ({
      realtimeNotices: [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          message,
          createdAt: new Date().toISOString(),
        },
        ...state.realtimeNotices,
      ].slice(0, 50),
    })),
  clearRealtimeNotices: () => set({ realtimeNotices: [] }),
  startConveyor: () => set({ isRunning: true }),
  stopConveyor: () => set({ isRunning: false }),
  pushResult: (result) =>
    set((state) => ({
      lastResult: result,
      wholeCount: state.wholeCount + (result.grade === "whole" ? 1 : 0),
      brokenCount: state.brokenCount + (result.grade === "broken" ? 1 : 0),
      defectCount: state.defectCount + (result.grade === "defect" ? 1 : 0),
      feedItems: [result, ...state.feedItems].slice(0, 20),
    })),
}));
