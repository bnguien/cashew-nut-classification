import { useFonts, Inter_400Regular, Inter_500Medium, Inter_700Bold } from "@expo-google-fonts/inter";
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { ActivityIndicator, View } from "react-native";

import { AppColors } from "@/src/constants/colors";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: AppColors.background }}>
        <ActivityIndicator color={AppColors.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="admin/users" options={{ title: "Quản trị tài khoản" }} />
        <Stack.Screen name="server-config" options={{ title: "Cấu hình Server" }} />
        <Stack.Screen name="session/[id]" options={{ title: "Session Detail" }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}
