import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { useServerConfigStore } from "@/src/store/useServerConfigStore";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AppColors } from "@/src/constants/colors";
import { useAuthStore } from "@/src/store/useAuthStore";

export default function LoginScreen() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { login, loading, error } = useAuthStore();
  const { ip, port } = useServerConfigStore();

  async function onLogin() {
    const ok = await login(username, password);
    if (ok) {
      const role = useAuthStore.getState().user?.role;
      router.replace(role === "admin" ? "/admin/users" : "/(tabs)/live");
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.logoWrap}>
        <Text style={styles.logo}>🌰 Cashew Grader</Text>
        <Text style={styles.subtitle}>Hệ thống Phân loại Hạt Điều</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Tên đăng nhập</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="admin"
          style={styles.input}
          placeholderTextColor={AppColors.textSecondary}
        />

        <Text style={styles.label}>Mật khẩu</Text>
        <View style={styles.passwordRow}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholder="Nhập mật khẩu"
            style={[styles.input, styles.passwordInput]}
            placeholderTextColor={AppColors.textSecondary}
          />
          <Pressable onPress={() => setShowPassword((prev) => !prev)} style={styles.eyeButton}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={AppColors.textSecondary} />
          </Pressable>
        </View>

        <Pressable style={styles.loginBtn} onPress={onLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.loginText}>Đăng nhập</Text>
          )}
        </Pressable>

        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>

      <Pressable style={styles.serverConfigBtn} onPress={() => router.push("/server-config")}>
        <Ionicons name="settings-outline" size={15} color={AppColors.textSecondary} />
        <Text style={styles.serverConfigText}>
          {ip}:{port}
        </Text>
        <Text style={styles.serverConfigLabel}>Cấu hình Server</Text>
      </Pressable>

      <Text style={styles.version}>v1.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.background,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  logoWrap: {
    alignItems: "center",
    marginBottom: 20,
  },
  logo: {
    fontSize: 28,
    color: AppColors.primary,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: AppColors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  card: {
    backgroundColor: AppColors.surface,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 20,
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  label: {
    fontSize: 12,
    color: AppColors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 8,
    fontFamily: "Inter_500Medium",
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
    height: 48,
    fontSize: 16,
    color: AppColors.textPrimary,
    fontFamily: "Inter_400Regular",
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  passwordInput: { flex: 1 },
  eyeButton: { paddingLeft: 10, paddingTop: 10, paddingBottom: 10 },
  loginBtn: {
    marginTop: 18,
    height: 52,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AppColors.primary,
  },
  loginText: {
    color: "#ffffff",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  error: {
    marginTop: 10,
    color: AppColors.gradeDefect,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  version: {
    marginTop: 8,
    textAlign: "center",
    color: AppColors.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  serverConfigBtn: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.surface,
  },
  serverConfigText: {
    color: AppColors.primary,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  serverConfigLabel: {
    color: AppColors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
