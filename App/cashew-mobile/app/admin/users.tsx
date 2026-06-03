import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/src/components/common/ScreenContainer";
import { AppColors } from "@/src/constants/colors";
import { createAdminUser, deleteAdminUser, fetchAdminUsers, updateAdminUser } from "@/src/services/http/admin";
import { useAuthStore } from "@/src/store/useAuthStore";
import { AdminUserItem } from "@/src/types/api";
import { router } from "expo-router";

type Role = "admin" | "operator" | "viewer";

const ROLES: Role[] = ["admin", "operator", "viewer"];

export default function AdminUsersScreen() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [isActive, setIsActive] = useState(true);

  const isAdmin = user?.role === "admin";

  const resetForm = useCallback(() => {
    setEditingId(null);
    setUsername("");
    setPassword("");
    setRole("operator");
    setIsActive(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminUsers();
      setItems(data);
    } catch {
      Alert.alert("Lỗi", "Không tải được danh sách nhân viên.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      router.replace("/(tabs)/live");
      return;
    }
    load();
  }, [isAdmin, load]);

  const currentTitle = useMemo(() => (editingId ? "Cập nhật tài khoản" : "Thêm tài khoản"), [editingId]);

  async function onSubmit() {
    if (!username.trim()) {
      Alert.alert("Thiếu dữ liệu", "Vui lòng nhập username.");
      return;
    }
    if (!editingId && password.trim().length < 6) {
      Alert.alert("Thiếu dữ liệu", "Mật khẩu phải từ 6 ký tự.");
      return;
    }

    try {
      setLoading(true);
      const payload = {
        username: username.trim(),
        role,
        is_active: isActive,
        ...(password.trim() ? { password: password.trim() } : {}),
      };
      if (editingId) {
        await updateAdminUser(editingId, payload);
      } else {
        await createAdminUser(payload);
      }
      resetForm();
      await load();
    } catch {
      Alert.alert("Thất bại", "Không thể lưu tài khoản. Kiểm tra quyền admin hoặc dữ liệu nhập.");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id: number) {
    Alert.alert("Xóa tài khoản", "Bạn chắc chắn muốn xóa tài khoản này?", [
      { text: "Hủy", style: "cancel" },
      {
        text: "Xóa",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            await deleteAdminUser(id);
            await load();
          } catch {
            Alert.alert("Thất bại", "Không thể xóa tài khoản này.");
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Quản lý nhân viên</Text>
        <Pressable style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{currentTitle}</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="Username"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder={editingId ? "Mật khẩu mới (optional)" : "Mật khẩu"}
          secureTextEntry
        />
        <View style={styles.rolesRow}>
          {ROLES.map((item) => (
            <Pressable
              key={item}
              onPress={() => setRole(item)}
              style={[styles.roleChip, role === item && styles.roleChipActive]}>
              <Text style={[styles.roleText, role === item && styles.roleTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.label}>Đang hoạt động</Text>
          <Switch value={isActive} onValueChange={setIsActive} />
        </View>
        <View style={styles.actionsRow}>
          <Pressable style={styles.primaryBtn} onPress={onSubmit} disabled={loading}>
            <Text style={styles.primaryText}>{editingId ? "Cập nhật" : "Thêm mới"}</Text>
          </Pressable>
          {editingId ? (
            <Pressable style={styles.secondaryBtn} onPress={resetForm} disabled={loading}>
              <Text style={styles.secondaryText}>Hủy</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <View style={styles.userCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{item.username}</Text>
              <Text style={styles.userMeta}>
                role: {item.role} • {item.is_active ? "active" : "inactive"}
              </Text>
            </View>
            <Pressable
              style={styles.smallBtn}
              onPress={() => {
                setEditingId(item.id);
                setUsername(item.username);
                setPassword("");
                setRole(item.role);
                setIsActive(item.is_active);
              }}>
              <Text style={styles.smallBtnText}>Sửa</Text>
            </Pressable>
            <Pressable style={[styles.smallBtn, styles.deleteBtn]} onPress={() => onDelete(item.id)}>
              <Text style={styles.smallBtnText}>Xóa</Text>
            </Pressable>
          </View>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, marginBottom: 12 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: AppColors.textPrimary },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: AppColors.primary },
  logoutText: { color: "#fff", fontFamily: "Inter_500Medium" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: AppColors.border },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: AppColors.textPrimary, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
    marginBottom: 8,
    color: AppColors.textPrimary,
    fontFamily: "Inter_400Regular",
    backgroundColor: "#fff",
  },
  rolesRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  roleChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: AppColors.border },
  roleChipActive: { borderColor: AppColors.accent, backgroundColor: "#EAF2FF" },
  roleText: { color: AppColors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 12 },
  roleTextActive: { color: AppColors.accent },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  label: { color: AppColors.textPrimary, fontFamily: "Inter_500Medium" },
  actionsRow: { flexDirection: "row", gap: 8 },
  primaryBtn: { flex: 1, backgroundColor: AppColors.primary, borderRadius: 8, height: 40, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontFamily: "Inter_500Medium" },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: AppColors.border, borderRadius: 8, height: 40, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: AppColors.textPrimary, fontFamily: "Inter_500Medium" },
  userCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  userName: { fontSize: 14, color: AppColors.textPrimary, fontFamily: "Inter_700Bold" },
  userMeta: { fontSize: 12, color: AppColors.textSecondary, fontFamily: "Inter_400Regular", marginTop: 2 },
  smallBtn: { backgroundColor: AppColors.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  smallBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
  deleteBtn: { backgroundColor: AppColors.gradeDefect },
});
