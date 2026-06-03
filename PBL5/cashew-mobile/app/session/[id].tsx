import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/src/components/common/ScreenContainer";
import { AppColors } from "@/src/constants/colors";
import { fetchResultsBySession, fetchSessionById } from "@/src/services/http/conveyor";
import { ClassifyResult, ConveyorSession, Grade } from "@/src/types/domain";

const gradeColor: Record<Grade, string> = {
  whole: AppColors.gradeWhole,
  broken: AppColors.gradeBroken,
  defect: AppColors.gradeDefect,
};

const gradeLabel: Record<Grade, string> = {
  whole: "Nguyên",
  broken: "Vỡ",
  defect: "Hỏng",
};

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<ConveyorSession | null>(null);
  const [results, setResults] = useState<ClassifyResult[]>([]);
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    async function load() {
      try {
        const [sessionData, resultData] = await Promise.all([
          fetchSessionById(Number(id)),
          fetchResultsBySession(Number(id)),
        ]);
        if (!mounted) return;
        setSession(sessionData);
        setResults(resultData);
      } catch {
        // Network error — keep loading state so user knows something failed.
      }
    }
    load();
    return () => { mounted = false; };
  }, [id]);

  if (!session) {
    return (
      <ScreenContainer>
        <Text style={styles.loadingText}>Đang tải dữ liệu phiên...</Text>
      </ScreenContainer>
    );
  }

  const defectRate =
    session.total_count > 0
      ? Math.round((session.defect_count / session.total_count) * 100)
      : 0;

  return (
    <ScreenContainer>
      {/* Full-screen image viewer */}
      <Modal
        transparent
        visible={!!imageModalUrl}
        animationType="fade"
        onRequestClose={() => setImageModalUrl(null)}
      >
        <Pressable style={styles.imageModalBackdrop} onPress={() => setImageModalUrl(null)}>
          <Image
            source={{ uri: imageModalUrl ?? "" }}
            style={styles.imageModalFull}
            resizeMode="contain"
          />
          <Text style={styles.imageModalHint}>Nhấn để đóng</Text>
        </Pressable>
      </Modal>

      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* Session summary */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <Text style={styles.header}>Phiên #{session.id}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: session.status === "running" ? AppColors.gradeWhole : "#e0e0e0" },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      { color: session.status === "running" ? "#fff" : AppColors.textSecondary },
                    ]}
                  >
                    {session.status === "running" ? "Đang chạy" : session.status === "completed" ? "Hoàn thành" : session.status}
                  </Text>
                </View>
              </View>

              <View style={styles.metricsRow}>
                <View style={styles.metricBox}>
                  <Text style={styles.metricValue}>{session.total_count}</Text>
                  <Text style={styles.metricLabel}>Tổng</Text>
                </View>
                <View style={[styles.metricBox, { borderLeftWidth: 1, borderLeftColor: AppColors.border }]}>
                  <Text style={[styles.metricValue, { color: AppColors.gradeWhole }]}>
                    {session.whole_count}
                  </Text>
                  <Text style={styles.metricLabel}>Nguyên</Text>
                </View>
                <View style={[styles.metricBox, { borderLeftWidth: 1, borderLeftColor: AppColors.border }]}>
                  <Text style={[styles.metricValue, { color: AppColors.gradeBroken }]}>
                    {session.broken_count}
                  </Text>
                  <Text style={styles.metricLabel}>Vỡ</Text>
                </View>
                <View style={[styles.metricBox, { borderLeftWidth: 1, borderLeftColor: AppColors.border }]}>
                  <Text style={[styles.metricValue, { color: AppColors.gradeDefect }]}>
                    {session.defect_count}
                  </Text>
                  <Text style={styles.metricLabel}>Hỏng</Text>
                </View>
              </View>

              <View style={styles.defectRow}>
                <Text style={styles.defectLabel}>Tỉ lệ lỗi</Text>
                <Text
                  style={[
                    styles.defectValue,
                    { color: defectRate > 20 ? AppColors.gradeDefect : AppColors.gradeWhole },
                  ]}
                >
                  {defectRate}%
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>
              Kết quả phân loại ({results.length})
            </Text>
          </>
        }
        renderItem={({ item }: { item: ClassifyResult }) => (
          <Pressable
            style={styles.resultRow}
            onPress={() => {
              const url = item.labeled_image_url ?? item.image_url;
              if (url) setImageModalUrl(url);
            }}
          >
            <View style={[styles.resultDot, { backgroundColor: gradeColor[item.grade] }]} />
            <View style={styles.resultInfo}>
              <Text style={styles.resultGrade}>{gradeLabel[item.grade]}</Text>
              <Text style={styles.resultMeta}>
                Độ chính xác: {Math.round(item.confidence * 100)}%
              </Text>
            </View>
            <Text style={styles.resultTime}>
              {new Date(item.created_at).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            {item.image_url ? (
              <Image
                source={{ uri: item.labeled_image_url ?? item.image_url }}
                style={styles.resultThumb}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.resultThumbPlaceholder}>
                <Ionicons name="image-outline" size={16} color={AppColors.textSecondary} />
              </View>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Chưa có kết quả phân loại.</Text>
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loadingText: { marginTop: 16, color: AppColors.textSecondary, fontFamily: "Inter_400Regular" },
  listContent: { gap: 8, paddingBottom: 20 },
  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  header: { fontSize: 18, color: AppColors.textPrimary, fontFamily: "Inter_700Bold" },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  metricsRow: { flexDirection: "row", marginBottom: 12 },
  metricBox: { flex: 1, alignItems: "center", paddingVertical: 4 },
  metricValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: AppColors.textPrimary },
  metricLabel: {
    fontSize: 11,
    color: AppColors.textSecondary,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  defectRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
    paddingTop: 10,
  },
  defectLabel: {
    fontSize: 13,
    color: AppColors.textSecondary,
    fontFamily: "Inter_500Medium",
  },
  defectValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sectionTitle: {
    fontSize: 14,
    color: AppColors.textPrimary,
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  resultDot: { width: 10, height: 10, borderRadius: 999, flexShrink: 0 },
  resultInfo: { flex: 1 },
  resultGrade: { fontSize: 14, color: AppColors.textPrimary, fontFamily: "Inter_700Bold" },
  resultMeta: {
    fontSize: 12,
    color: AppColors.textSecondary,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  resultTime: { fontSize: 11, color: AppColors.textSecondary, fontFamily: "Inter_400Regular" },
  resultThumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  resultThumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  empty: {
    textAlign: "center",
    color: AppColors.textSecondary,
    marginVertical: 20,
    fontFamily: "Inter_400Regular",
  },
  imageModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageModalFull: { width: "90%", height: "75%", borderRadius: 8 },
  imageModalHint: {
    marginTop: 16,
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
