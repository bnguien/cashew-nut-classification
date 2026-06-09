import { StyleSheet, View } from "react-native";

type SkeletonBlockProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
};

export function SkeletonBlock({ width = "100%", height = 16, radius = 8 }: SkeletonBlockProps) {
  return <View style={[styles.block, { width, height, borderRadius: radius }]} />;
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: "#e5e7eb",
  },
});
