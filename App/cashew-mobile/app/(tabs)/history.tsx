import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/src/components/common/ScreenContainer";
import { AppColors } from "@/src/constants/colors";
import { fetchSessions } from "@/src/services/http/conveyor";
import { ConveyorSession } from "@/src/types/domain";

function statusStyle(status: string) {
  if (status === "completed") return { bg: "#ecfdf3", text: "#166534", label: "Hoàn thành" };
  if (status === "running") return { bg: "#dbeafe", text: "#1d4ed8", label: "Đang chạy" };
  return { bg: "#fee2e2", text: "#991b1b", label: "Lỗi" };
}

export default function HistoryScreen() {
  const [items, setItems] = useState<ConveyorSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setRefreshing(true);
    try {
      setError(null);
      const data = await fetchSessions();
      setItems(data);
    } catch {
      setError("Khong the tai lich su. Kiem tra ket noi server.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  function renderItem({ item }: { item: ConveyorSession }) {
    const status = statusStyle(item.status);
    return (
      <Pressable style={styles.card} onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(item.id) } })}>
        <View style={styles.row}>
          <Text style={styles.sessionTitle}>Phiên #{item.id}</Text>
          <View style={[styles.chip, { backgroundColor: status.bg }]}>
            <Text style={[styles.chipText, { color: status.text }]}>{status.label}</Text>
          </View>
        </View>
        <Text style={styles.meta}>
          {new Date(item.started_at).toLocaleDateString("vi-VN")} ·{" "}
          {new Date(item.started_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
        </Text>
        <View style={styles.badgeRow}>
          <Text style={[styles.badge, { backgroundColor: "#dcfce7", color: "#166534" }]}>✓ {item.whole_count} Nguyên</Text>
          <Text style={[styles.badge, { backgroundColor: "#ffedd5", color: "#9a3412" }]}>↗ {item.broken_count} Vỡ</Text>
          <Text style={[styles.badge, { backgroundColor: "#fee2e2", color: "#991b1b" }]}>✕ {item.defect_count} Hỏng</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <ScreenContainer>
      <View style={{ marginTop: 10 }}>
        <Text style={styles.header}>Lịch sử Phiên</Text>
      </View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadSessions} />}
        contentContainerStyle={{ paddingVertical: 10 }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 18, color: AppColors.textPrimary, fontFamily: "Inter_700Bold" },
  card: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sessionTitle: { fontSize: 15, color: AppColors.textPrimary, fontFamily: "Inter_700Bold" },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  meta: { marginTop: 8, fontSize: 12, color: AppColors.textSecondary, fontFamily: "Inter_400Regular" },
  badgeRow: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  badge: { fontSize: 11, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 8, overflow: "hidden" },
  errorText: { marginTop: 8, color: "#991b1b", fontFamily: "Inter_400Regular" },
});
