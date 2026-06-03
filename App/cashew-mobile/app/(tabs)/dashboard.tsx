import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PieChart } from "react-native-chart-kit";

import { ScreenContainer } from "@/src/components/common/ScreenContainer";
import { SkeletonBlock } from "@/src/components/ui/SkeletonBlock";
import { AppColors } from "@/src/constants/colors";
import { fetchDashboardStats } from "@/src/services/http/dashboard";
import { DashboardStatsResponse } from "@/src/types/api";

export default function DashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadStats() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchDashboardStats();
        if (mounted) setStats(data);
      } catch {
        if (mounted) setError("Khong the ket noi server. Vui long kiem tra IP/Port.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadStats();
    return () => {
      mounted = false;
    };
  }, []);

  const total = stats?.total_count ?? 0;
  const wholeCount = stats?.whole_count ?? 0;
  const brokenCount = stats?.broken_count ?? 0;
  const defectCount = stats?.defect_count ?? 0;
  const defectRate = (stats?.defect_rate ?? 0) * 100;

  const chartData = [
    { name: "Nguyên", count: wholeCount, color: AppColors.gradeWhole, legendFontColor: AppColors.textPrimary, legendFontSize: 12 },
    { name: "Vỡ", count: brokenCount, color: AppColors.gradeBroken, legendFontColor: AppColors.textPrimary, legendFontSize: 12 },
    { name: "Hỏng", count: defectCount, color: AppColors.gradeDefect, legendFontColor: AppColors.textPrimary, legendFontSize: 12 },
  ];

  return (
    <ScreenContainer>
      {loading ? (
        <View style={{ marginTop: 10, gap: 10 }}>
          <SkeletonBlock height={22} width="35%" />
          <SkeletonBlock height={90} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <SkeletonBlock height={80} width="31%" />
            <SkeletonBlock height={80} width="31%" />
            <SkeletonBlock height={80} width="31%" />
          </View>
          <SkeletonBlock height={220} />
        </View>
      ) : (
        <>
      {!!error && (
        <View style={[styles.alertBanner, { backgroundColor: "#fee2e2", borderColor: AppColors.gradeDefect }]}>
          <Text style={[styles.alertText, { color: "#991b1b" }]}>{error}</Text>
        </View>
      )}
      <View style={styles.headerRow}>
        <Text style={styles.header}>Thống kê</Text>
        <View style={styles.sessionBtn}>
          <Text style={styles.sessionText}>Phiên #6 ▾</Text>
        </View>
      </View>

      <View style={[styles.card, styles.totalCard]}>
        <Text style={styles.totalLabel}>Tổng</Text>
        <Text style={[styles.bigValue, { color: AppColors.primary }]}>{total}</Text>
      </View>

      <View style={styles.row3}>
        {[
          { label: "Nguyên", value: wholeCount, color: AppColors.gradeWhole },
          { label: "Vỡ", value: brokenCount, color: AppColors.gradeBroken },
          { label: "Hỏng", value: defectCount, color: AppColors.gradeDefect },
        ].map((item) => (
          <View key={item.label} style={[styles.card, styles.miniCard]}>
            <Text style={[styles.bigValue, { color: item.color }]}>{item.value}</Text>
            <Text style={styles.miniLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tỉ lệ phân loại</Text>
        <PieChart
          data={chartData.map((item) => ({ ...item, population: item.count }))}
          width={320}
          height={180}
          chartConfig={{ color: () => AppColors.textPrimary }}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft="16"
          absolute={false}
        />
      </View>

      {defectRate > 20 && (
        <View style={styles.alertBanner}>
          <Text style={styles.alertText}>⚠ Tỉ lệ hạt hỏng vượt ngưỡng 20%</Text>
        </View>
      )}

      <View style={[styles.card, styles.todayCard]}>
        <Text style={styles.todayLabel}>Phiên hôm nay</Text>
        <Text style={styles.todayValue}>{stats?.sessions ?? 0}</Text>
      </View>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: { marginTop: 10, marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  header: { fontSize: 18, color: AppColors.textPrimary, fontFamily: "Inter_700Bold" },
  sessionBtn: { borderWidth: 1, borderColor: AppColors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#fff" },
  sessionText: { fontSize: 12, color: AppColors.textPrimary, fontFamily: "Inter_500Medium" },
  row3: { flexDirection: "row", gap: 10, marginTop: 10 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 10,
  },
  totalCard: { alignItems: "center", paddingVertical: 14 },
  totalLabel: { fontSize: 11, color: AppColors.textSecondary, fontFamily: "Inter_400Regular" },
  bigValue: { fontSize: 26, fontFamily: "Inter_700Bold", textAlign: "center" },
  miniCard: { flex: 1, alignItems: "center" },
  miniLabel: { fontSize: 11, color: AppColors.textSecondary, fontFamily: "Inter_400Regular" },
  cardTitle: { fontSize: 14, color: AppColors.textPrimary, marginBottom: 6, fontFamily: "Inter_500Medium" },
  alertBanner: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: AppColors.warning,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  alertText: { color: "#92400E", fontFamily: "Inter_500Medium" },
  todayCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14 },
  todayLabel: { fontSize: 14, color: AppColors.textSecondary, fontFamily: "Inter_500Medium" },
  todayValue: { fontSize: 26, color: AppColors.primary, fontFamily: "Inter_700Bold" },
});
