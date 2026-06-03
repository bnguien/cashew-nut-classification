import { StyleSheet, Text, View } from "react-native";

import { AppColors } from "@/src/constants/colors";
import { Grade } from "@/src/types/domain";

const gradeLabel: Record<Grade, string> = {
  whole: "Nguyên",
  broken: "Vỡ",
  defect: "Hỏng",
};

const gradeColor: Record<Grade, string> = {
  whole: AppColors.gradeWhole,
  broken: AppColors.gradeBroken,
  defect: AppColors.gradeDefect,
};

type GradeBadgeProps = {
  grade: Grade;
};

export function GradeBadge({ grade }: GradeBadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: gradeColor[grade] }]}>
      <Text style={styles.text}>{gradeLabel[grade]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 32,
    alignSelf: "center",
  },
  text: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
  },
});
