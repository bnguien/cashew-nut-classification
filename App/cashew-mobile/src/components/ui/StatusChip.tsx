import { StyleSheet, Text, View } from "react-native";

import { AppColors } from "@/src/constants/colors";

type StatusChipProps = {
  running: boolean;
};

export function StatusChip({ running }: StatusChipProps) {
  return (
    <View style={[styles.chip, running ? styles.runningBg : styles.stopBg]}>
      <View style={[styles.dot, { backgroundColor: running ? AppColors.gradeWhole : AppColors.statusStop }]} />
      <Text style={styles.text}>{running ? "Đang chạy" : "Dừng"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    gap: 6,
  },
  runningBg: { backgroundColor: "#ecfdf3", borderColor: "#86efac" },
  stopBg: { backgroundColor: "#f3f4f6", borderColor: "#d1d5db" },
  dot: { width: 8, height: 8, borderRadius: 999 },
  text: { fontSize: 12, fontWeight: "600", color: AppColors.textPrimary },
});
