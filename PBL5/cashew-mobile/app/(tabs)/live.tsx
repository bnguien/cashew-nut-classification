import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ScreenContainer } from "@/src/components/common/ScreenContainer";
import { GradeBadge } from "@/src/components/ui/GradeBadge";
import { StatusChip } from "@/src/components/ui/StatusChip";
import { AppColors } from "@/src/constants/colors";
import { useRealtimeConveyor } from "@/src/hooks/useRealtimeConveyor";
import {
  fetchOverview,
  fetchResultsBySession,
  startSession as startSessionApi,
  stopSession as stopSessionApi,
} from "@/src/services/http/conveyor";
import { useConveyorStore } from "@/src/store/useConveyorStore";
import { ClassifyResult, Grade } from "@/src/types/domain";

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

export default function LiveScreen() {
  useRealtimeConveyor();

  const {
    isRunning,
    espConnected,
    wholeCount,
    brokenCount,
    defectCount,
    feedItems,
    lastResult,
    currentSessionId,
    loading,
    setLoading,
    hydrateOverview,
    setFeedItems,
    setCounters,
    espPopupVisible,
    espPopupMessage,
    setEspPopup,
    setWaitingApproval,
    setConnection,
    setRunningState,
    setCurrentSessionId,
    realtimeNotices,
    clearRealtimeNotices,
  } = useConveyorStore();

  const [noticeModalVisible, setNoticeModalVisible] = useState(false);
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadInitial() {
      try {
        setLoading(true);
        const overview = await fetchOverview();
        if (!mounted) return;
        hydrateOverview(overview);
        if (overview.running_session_id) {
          const results = await fetchResultsBySession(overview.running_session_id);
          if (mounted) setFeedItems(results);
        }
      } catch {
        // Keep UI usable on network error.
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadInitial();
    return () => { mounted = false; };
  }, [hydrateOverview, setFeedItems, setLoading]);

  useEffect(() => {
    if (feedItems.length === 0) return;
    const whole = feedItems.filter((item) => item.grade === "whole").length;
    const broken = feedItems.filter((item) => item.grade === "broken").length;
    const defect = feedItems.filter((item) => item.grade === "defect").length;
    setCounters(whole, broken, defect);
  }, [feedItems, setCounters]);

  const items = useMemo(() => feedItems, [feedItems]);
  const latest = lastResult ?? items[0];
  const total = wholeCount + brokenCount + defectCount;

  async function onStart() {
    try {
      setLoading(true);
      const response = await startSessionApi();
      // Direct state update — no approval flow
      setRunningState(true);
      setWaitingApproval(false);
      setConnection(true);
      if (response.session?.id) {
        setCurrentSessionId(response.session.id);
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 400) {
        Alert.alert("Đã có phiên đang chạy", "Băng chuyền đang hoạt động.");
      } else {
        Alert.alert("Không thể bắt đầu", "Kiểm tra kết nối mạng hoặc đăng nhập lại.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function onStop() {
    try {
      setLoading(true);
      await stopSessionApi();
      setRunningState(false);
      setWaitingApproval(false);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 400) {
        Alert.alert("Không có phiên đang chạy", "Băng chuyền đã dừng từ trước.");
      } else {
        Alert.alert("Không thể dừng", "Kiểm tra kết nối mạng hoặc đăng nhập lại.");
      }
    } finally {
      setLoading(false);
    }
  }

  function openImageModal(url: string | null | undefined) {
    if (url) setImageModalUrl(url);
  }

  return (
    <ScreenContainer>
      {/* ESP popup notification */}
      <Modal transparent visible={espPopupVisible} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Thông báo hệ thống</Text>
            <Text style={styles.modalMessage}>{espPopupMessage}</Text>
            <Pressable style={styles.modalButton} onPress={() => setEspPopup(false)}>
              <Text style={styles.modalButtonText}>Đóng</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
        data={items}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Theo dõi Băng chuyền</Text>
              <View style={styles.headerRight}>
                <Pressable style={styles.noticeBtn} onPress={() => setNoticeModalVisible(true)}>
                  <Ionicons name="notifications-outline" size={16} color="#fff" />
                  <Text style={styles.noticeBtnText}>Thông báo</Text>
                </Pressable>
                <StatusChip running={isRunning} />
              </View>
            </View>

            {/* Control card */}
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.labelMd}>Trạng thái</Text>
                <StatusChip running={isRunning} />
              </View>

              <View style={styles.espRow}>
                <Ionicons
                  name="wifi"
                  size={14}
                  color={
                    isRunning
                      ? AppColors.gradeWhole
                      : espConnected
                      ? AppColors.accent
                      : AppColors.gradeDefect
                  }
                />
                <Text
                  style={[
                    styles.espText,
                    {
                      color: isRunning
                        ? AppColors.gradeWhole
                        : espConnected
                        ? AppColors.accent
                        : AppColors.gradeDefect,
                    },
                  ]}
                >
                  ESP32:{" "}
                  {isRunning
                    ? "Đang hoạt động"
                    : espConnected
                    ? "Sẵn sàng"
                    : "Mất kết nối"}
                </Text>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  onPress={onStart}
                  disabled={isRunning || loading}
                  style={[
                    styles.actionBtn,
                    styles.startBtn,
                    (isRunning || loading) && styles.disabledBtn,
                  ]}
                >
                  {loading && !isRunning ? (
                    <Text style={styles.actionText}>...</Text>
                  ) : (
                    <Text style={styles.actionText}>▶ Bắt đầu</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={onStop}
                  disabled={!isRunning || loading}
                  style={[
                    styles.actionBtn,
                    styles.stopBtn,
                    (!isRunning || loading) && styles.disabledBtn,
                  ]}
                >
                  {loading && isRunning ? (
                    <Text style={styles.actionText}>...</Text>
                  ) : (
                    <Text style={styles.actionText}>■ Dừng lại</Text>
                  )}
                </Pressable>
              </View>
            </View>

            {/* Latest result card */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Kết quả Gần nhất</Text>
              {latest ? (
                <>
                  <View style={styles.latestRow}>
                    <View style={styles.latestLeft}>
                      <GradeBadge grade={latest.grade} />
                      <Text style={styles.confidence}>{Math.round(latest.confidence * 100)}%</Text>
                      <Text style={styles.caption}>Độ chính xác</Text>
                      <View style={styles.resultFooter}>
                        <Text style={styles.gradeText}>Phân loại: {gradeLabel[latest.grade]}</Text>
                        <Text style={styles.timestamp}>
                          {new Date(latest.created_at).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </Text>
                      </View>
                    </View>
                    {latest.image_url ? (
                      <Pressable onPress={() => openImageModal(latest.image_url)}>
                        <Image
                          source={{ uri: latest.image_url }}
                          style={styles.latestThumb}
                          resizeMode="cover"
                        />
                      </Pressable>
                    ) : null}
                  </View>
                </>
              ) : (
                <Text style={styles.empty}>Chưa có dữ liệu</Text>
              )}
            </View>

            {/* Counter card */}
            <View style={[styles.card, styles.counterCard]}>
              {[
                { label: "Nguyên", value: wholeCount, color: AppColors.gradeWhole },
                { label: "Vỡ", value: brokenCount, color: AppColors.gradeBroken },
                { label: "Hỏng", value: defectCount, color: AppColors.gradeDefect },
              ].map((item, idx) => (
                <View
                  key={item.label}
                  style={[styles.counterCol, idx < 2 && styles.counterDivider]}
                >
                  <Text style={[styles.counterValue, { color: item.color }]}>{item.value}</Text>
                  <View style={styles.counterLabelRow}>
                    <View style={[styles.dot8, { backgroundColor: item.color }]} />
                    <Text style={styles.counterLabel}>{item.label}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Text style={styles.feedTitle}>LUỒNG PHÂN LOẠI</Text>
            {!!currentSessionId && (
              <Text style={styles.sessionHint}>Phiên đang xem: #{currentSessionId}</Text>
            )}
            {total === 0 && <Text style={styles.empty}>Chưa có dữ liệu</Text>}
          </View>
        }
        renderItem={({ item }: { item: ClassifyResult }) => (
          <Pressable
            style={styles.feedCard}
            onPress={() => openImageModal(item.image_url ?? item.labeled_image_url)}
          >
            <View style={[styles.gradeBar, { backgroundColor: gradeColor[item.grade] }]} />
            <View style={styles.feedTextWrap}>
              <Text style={styles.feedGrade}>{gradeLabel[item.grade]}</Text>
              <Text style={styles.feedMeta}>{Math.round(item.confidence * 100)}%</Text>
            </View>
            <Text style={styles.feedTime}>
              {new Date(item.created_at).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            {item.image_url ? (
              <Image
                source={{ uri: item.image_url }}
                style={styles.feedThumb}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.feedThumbPlaceholder}>
                <Ionicons name="image-outline" size={18} color={AppColors.textSecondary} />
              </View>
            )}
          </Pressable>
        )}
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      {/* Realtime notices modal */}
      <Modal
        transparent
        visible={noticeModalVisible}
        animationType="slide"
        onRequestClose={() => setNoticeModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.noticeModalCard}>
            <View style={styles.noticeHeaderRow}>
              <Text style={styles.modalTitle}>Realtime từ server</Text>
              <Pressable onPress={clearRealtimeNotices}>
                <Text style={styles.clearText}>Xóa hết</Text>
              </Pressable>
            </View>
            {realtimeNotices.length === 0 ? (
              <Text style={styles.empty}>Chưa có thông báo realtime.</Text>
            ) : (
              <FlatList
                data={realtimeNotices}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.noticeItem}>
                    <Text style={styles.noticeMsg}>{item.message}</Text>
                    <Text style={styles.noticeTime}>
                      {new Date(item.createdAt).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </Text>
                  </View>
                )}
              />
            )}
            <Pressable style={styles.modalButton} onPress={() => setNoticeModalVisible(false)}>
              <Text style={styles.modalButtonText}>Đóng</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerWrap: { paddingTop: 10, gap: 12 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  noticeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: AppColors.accent,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 8,
  },
  noticeBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
  title: { fontSize: 18, color: AppColors.textPrimary, fontFamily: "Inter_700Bold" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  labelMd: { fontSize: 14, color: AppColors.textSecondary, fontFamily: "Inter_500Medium" },
  espRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  espText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  actionRow: { marginTop: 14, flexDirection: "row" },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  startBtn: { backgroundColor: AppColors.gradeWhole },
  stopBtn: { backgroundColor: AppColors.gradeDefect, marginLeft: 10 },
  disabledBtn: { opacity: 0.4 },
  actionText: { color: "#fff", fontSize: 15, fontFamily: "Inter_500Medium" },
  sectionTitle: {
    fontSize: 14,
    color: AppColors.textSecondary,
    fontFamily: "Inter_500Medium",
    marginBottom: 12,
  },
  latestRow: { flexDirection: "row", alignItems: "flex-start" },
  latestLeft: { flex: 1 },
  latestThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  confidence: {
    textAlign: "center",
    marginTop: 10,
    fontSize: 28,
    color: AppColors.textPrimary,
    fontFamily: "Inter_700Bold",
  },
  caption: {
    textAlign: "center",
    fontSize: 12,
    color: AppColors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  resultFooter: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gradeText: { fontSize: 13, color: AppColors.textPrimary, fontFamily: "Inter_500Medium" },
  timestamp: {
    fontSize: 11,
    color: AppColors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  counterCard: { flexDirection: "row", paddingVertical: 12 },
  counterCol: { flex: 1, alignItems: "center" },
  counterDivider: { borderRightWidth: 1, borderRightColor: AppColors.border },
  counterValue: { fontSize: 24, fontFamily: "Inter_700Bold" },
  counterLabelRow: { marginTop: 3, flexDirection: "row", alignItems: "center", gap: 5 },
  dot8: { width: 8, height: 8, borderRadius: 999 },
  counterLabel: {
    fontSize: 12,
    color: AppColors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  feedTitle: {
    marginTop: 2,
    marginLeft: 2,
    fontSize: 13,
    color: AppColors.textSecondary,
    letterSpacing: 0.8,
    fontFamily: "Inter_500Medium",
  },
  sessionHint: {
    marginTop: 2,
    fontSize: 11,
    color: AppColors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  feedCard: {
    height: 64,
    backgroundColor: "#fff",
    borderRadius: 8,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  gradeBar: {
    width: 4,
    alignSelf: "stretch",
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  feedTextWrap: { flex: 1, marginLeft: 12 },
  feedGrade: { fontSize: 14, color: AppColors.textPrimary, fontFamily: "Inter_700Bold" },
  feedMeta: {
    fontSize: 12,
    color: AppColors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  feedTime: {
    marginRight: 8,
    fontSize: 11,
    color: AppColors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  feedThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    marginRight: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  feedThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 6,
    marginRight: 10,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalCard: { width: "100%", backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  noticeModalCard: {
    width: "100%",
    maxHeight: "75%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
  },
  noticeHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  clearText: { color: AppColors.accent, fontFamily: "Inter_500Medium", fontSize: 13 },
  noticeItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  noticeMsg: { color: AppColors.textPrimary, fontFamily: "Inter_500Medium", fontSize: 13 },
  noticeTime: {
    color: AppColors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
  modalTitle: {
    fontSize: 16,
    color: AppColors.textPrimary,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: AppColors.textPrimary,
    fontFamily: "Inter_400Regular",
    marginBottom: 14,
  },
  modalButton: {
    height: 42,
    borderRadius: 8,
    backgroundColor: AppColors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  modalButtonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_500Medium" },
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
