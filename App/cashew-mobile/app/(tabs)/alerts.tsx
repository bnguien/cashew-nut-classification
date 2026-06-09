import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/src/components/common/ScreenContainer";
import { AppColors } from "@/src/constants/colors";
import { fetchAlerts, markAlertRead } from "@/src/services/http/conveyor";
import { useAlertStore } from "@/src/store/useAlertStore";
import { AlertItem } from "@/src/types/domain";

function iconForType(type: AlertItem["alert_type"]) {
  if (type === "defect_threshold") return { icon: "warning-outline" as const, bg: "#fef3c7", color: "#92400e" };
  if (type === "connection_lost") return { icon: "wifi-outline" as const, bg: "#fee2e2", color: "#991b1b" };
  if (type === "conveyor_stop") return { icon: "stop-circle-outline" as const, bg: "#f3f4f6", color: "#374151" };
  return { icon: "alert-circle-outline" as const, bg: "#fee2e2", color: "#991b1b" };
}

export default function AlertsScreen() {
  const { alerts, loading, setLoading, setAlerts, markRead, markAllRead } = useAlertStore();
  const [error, setError] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const data = await fetchAlerts();
      setAlerts(data);
    } catch {
      setError("Khong the tai canh bao. Kiem tra ket noi server.");
    } finally {
      setLoading(false);
    }
  }, [setAlerts, setLoading]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  async function onMarkRead(id: number) {
    markRead(id);
    try {
      await markAlertRead(id);
    } catch {
      // Keep optimistic update for smoother UX.
    }
  }

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Cảnh báo</Text>
        <Pressable onPress={markAllRead}>
          <Text style={styles.readAll}>Đọc tất cả</Text>
        </Pressable>
      </View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={alerts}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAlerts} />}
        renderItem={({ item }) => {
          const icon = iconForType(item.alert_type);
          return (
            <Pressable
              style={[styles.item, !item.is_read && styles.unreadBorder]}
              onPress={() => onMarkRead(item.id)}>
              <View style={[styles.iconWrap, { backgroundColor: icon.bg }]}>
                <Ionicons name={icon.icon} size={16} color={icon.color} />
              </View>
              <View style={styles.middle}>
                <Text style={[styles.message, { color: item.is_read ? "#9CA3AF" : AppColors.textPrimary }]}>{item.message}</Text>
                <Text style={styles.time}>{new Date(item.created_at).toLocaleString("vi-VN")}</Text>
              </View>
              {!item.is_read && <View style={styles.dot} />}
            </Pressable>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: { marginTop: 10, marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  header: { fontSize: 18, color: AppColors.textPrimary, fontFamily: "Inter_700Bold" },
  readAll: { fontSize: 13, color: AppColors.accent, fontFamily: "Inter_500Medium" },
  item: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  unreadBorder: { borderLeftWidth: 3, borderLeftColor: AppColors.accent },
  iconWrap: { width: 24, height: 24, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  middle: { flex: 1, marginLeft: 10 },
  message: { fontSize: 14, fontFamily: "Inter_500Medium" },
  time: { marginTop: 3, fontSize: 11, color: AppColors.textSecondary, fontFamily: "Inter_400Regular" },
  dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: AppColors.accent },
  errorText: { marginBottom: 6, color: "#991b1b", fontFamily: "Inter_400Regular" },
});
