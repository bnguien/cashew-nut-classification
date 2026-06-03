import { Redirect } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { AppColors } from "@/src/constants/colors";
import { useAuthStore } from "@/src/store/useAuthStore";
import { useServerConfigStore } from "@/src/store/useServerConfigStore";

export default function IndexScreen() {
  const { accessToken, hydrated, hydrate, user } = useAuthStore();
  const { loaded, load } = useServerConfigStore();

  useEffect(() => {
    hydrate();
    load();
  }, [hydrate, load]);

  if (!hydrated || !loaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: AppColors.background }}>
        <ActivityIndicator color={AppColors.primary} />
      </View>
    );
  }

  if (!accessToken) {
    return <Redirect href="/login" />;
  }

  return <Redirect href={user?.role === "admin" ? "/admin/users" : "/(tabs)/live"} />;
}
