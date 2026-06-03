import { Redirect, router, Tabs } from "expo-router";
import React from 'react';
import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";

import { AppColors } from "@/src/constants/colors";
import { useAlertStore } from "@/src/store/useAlertStore";
import { useAuthStore } from "@/src/store/useAuthStore";

export default function TabLayout() {
  const unreadCount = useAlertStore((state) => state.unreadCount);
  const user = useAuthStore((state) => state.user);

  if (user?.role === "admin") {
    return <Redirect href="/admin/users" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: AppColors.primary,
        tabBarInactiveTintColor: "#9CA3AF",
        tabBarStyle: { backgroundColor: "#ffffff", borderTopColor: AppColors.border, height: 62 },
        headerShown: true,
        headerTitleStyle: { fontFamily: "Inter_700Bold", fontSize: 18, color: AppColors.textPrimary },
        headerStyle: { backgroundColor: AppColors.background },
        headerRight: () => (
          <Pressable onPress={() => router.push("/server-config")} style={{ paddingHorizontal: 6 }}>
            <Ionicons name="settings-outline" size={20} color={AppColors.primary} />
          </Pressable>
        ),
      }}>
      <Tabs.Screen
        name="live"
        options={{
          title: 'Theo dõi',
          tabBarIcon: ({ color, size }) => <Ionicons name="radio" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Thống kê",
          tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Lịch sử",
          tabBarIcon: ({ color, size }) => <Ionicons name="time" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Cảnh báo",
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications" color={color} size={size} />,
          tabBarBadge: unreadCount > 0 ? " " : undefined,
          tabBarBadgeStyle: {
            minWidth: 8,
            height: 8,
            borderRadius: 999,
            backgroundColor: AppColors.gradeDefect,
            color: "transparent",
            top: 5,
          },
        }}
      />
    </Tabs>
  );
}
