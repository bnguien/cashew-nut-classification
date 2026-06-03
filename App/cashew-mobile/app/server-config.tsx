import { router } from "expo-router";
import { useEffect, useState } from "react";
import axios from "axios";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getApiBaseUrl } from "@/src/config/network-config";
import { ScreenContainer } from "@/src/components/common/ScreenContainer";
import { AppColors } from "@/src/constants/colors";
import { useAuthStore } from "@/src/store/useAuthStore";
import { useServerConfigStore } from "@/src/store/useServerConfigStore";

export default function ServerConfigScreen() {
  const { ip, port, save } = useServerConfigStore();
  const logout = useAuthStore((state) => state.logout);
  const [formIp, setFormIp] = useState(ip);
  const [formPort, setFormPort] = useState(port);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setFormIp(ip);
    setFormPort(port);
  }, [ip, port]);

  function validate() {
    if (!formIp.trim()) {
      Alert.alert("Thiếu IP", "Vui lòng nhập địa chỉ IP server.");
      return false;
    }
    if (!/^\d+$/.test(formPort.trim())) {
      Alert.alert("Port không hợp lệ", "Port chỉ được chứa số.");
      return false;
    }
    return true;
  }

  async function onSave() {
    if (!validate()) return;
    try {
      setSaving(true);
      await save(formIp, formPort);
      Alert.alert("Đã lưu", "Cấu hình server đã được cập nhật.");
      router.back();
    } finally {
      setSaving(false);
    }
  }

  async function onTestConnection() {
    if (!validate()) return;
    try {
      setTesting(true);
      await save(formIp, formPort);
      await axios.get(`${getApiBaseUrl()}/api/health/`, { timeout: 5000 });
      Alert.alert("Kết nối thành công", "Mobile đã gọi được API server.");
    } catch {
      Alert.alert("Kết nối thất bại", "Không gọi được API. Kiểm tra IP/port và server đang chạy.");
    } finally {
      setTesting(false);
    }
  }

  function onLogout() {
    Alert.alert("Đăng xuất", "Bạn có chắc muốn đăng xuất?", [
      { text: "Hủy", style: "cancel" },
      {
        text: "Đăng xuất",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  }

  return (
    <ScreenContainer>
      <View style={styles.wrap}>
        <Text style={styles.title}>Cấu hình kết nối Server</Text>
        <Text style={styles.help}>Nhập IP và port của Django server để mobile gọi API/WebSocket.</Text>

        <Text style={styles.label}>IP Server</Text>
        <TextInput
          style={styles.input}
          value={formIp}
          onChangeText={setFormIp}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="VD: 10.0.2.2 hoặc 192.168.1.100"
          placeholderTextColor={AppColors.textSecondary}
        />

        <Text style={styles.label}>Port</Text>
        <TextInput
          style={styles.input}
          value={formPort}
          onChangeText={setFormPort}
          keyboardType="number-pad"
          placeholder="5000"
          placeholderTextColor={AppColors.textSecondary}
        />

        <Pressable style={[styles.btn, styles.testBtn, testing && styles.disabled]} onPress={onTestConnection} disabled={testing}>
          <Text style={styles.btnText}>{testing ? "Đang kiểm tra..." : "Kiểm tra kết nối"}</Text>
        </Pressable>

        <Pressable style={[styles.btn, styles.saveBtn, saving && styles.disabled]} onPress={onSave} disabled={saving}>
          <Text style={styles.btnText}>{saving ? "Đang lưu..." : "Lưu cấu hình"}</Text>
        </Pressable>

        <Pressable style={[styles.btn, styles.logoutBtn]} onPress={onLogout}>
          <Text style={styles.btnText}>Đăng xuất</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  title: { fontSize: 20, color: AppColors.textPrimary, fontFamily: "Inter_700Bold" },
  help: { marginTop: 6, marginBottom: 16, color: AppColors.textSecondary, fontFamily: "Inter_400Regular" },
  label: { marginTop: 8, marginBottom: 6, color: AppColors.textPrimary, fontFamily: "Inter_500Medium" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 12,
    color: AppColors.textPrimary,
    fontFamily: "Inter_400Regular",
  },
  btn: {
    marginTop: 14,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  testBtn: { backgroundColor: AppColors.accent },
  saveBtn: { backgroundColor: AppColors.primary },
  logoutBtn: { backgroundColor: AppColors.gradeDefect },
  btnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_500Medium" },
  disabled: { opacity: 0.6 },
});
