import { PropsWithChildren } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";

import { AppColors } from "@/src/constants/colors";

export function ScreenContainer({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: AppColors.background },
  container: { flex: 1, paddingHorizontal: 16 },
});
