import { create } from "zustand";

import { AlertItem } from "@/src/types/domain";

type AlertState = {
  loading: boolean;
  alerts: AlertItem[];
  unreadCount: number;
  setAlerts: (alerts: AlertItem[]) => void;
  setLoading: (loading: boolean) => void;
  pushAlert: (alert: AlertItem) => void;
  markRead: (id: number) => void;
  markAllRead: () => void;
};

export const useAlertStore = create<AlertState>((set) => ({
  loading: false,
  alerts: [],
  unreadCount: 0,
  setLoading: (loading) => set({ loading }),
  setAlerts: (alerts) =>
    set({
      alerts,
      unreadCount: alerts.filter((item) => !item.is_read).length,
    }),
  pushAlert: (alert) =>
    set((state) => {
      const alerts = [alert, ...state.alerts];
      return { alerts, unreadCount: alerts.filter((item) => !item.is_read).length };
    }),
  markRead: (id) =>
    set((state) => {
      const alerts = state.alerts.map((item) => (item.id === id ? { ...item, is_read: true } : item));
      return { alerts, unreadCount: alerts.filter((item) => !item.is_read).length };
    }),
  markAllRead: () =>
    set((state) => {
      const alerts = state.alerts.map((item) => ({ ...item, is_read: true }));
      return { alerts, unreadCount: 0 };
    }),
}));
