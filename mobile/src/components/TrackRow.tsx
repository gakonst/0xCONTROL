import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { Track } from "../api/catalog";

type TrackRowProps = {
  track: Track;
  isActive: boolean;
  onPress: (trackId: string) => void;
};

export const TrackRow = memo(function TrackRow({
  track,
  isActive,
  onPress,
}: TrackRowProps) {
  return (
    <TouchableOpacity
      onPress={() => onPress(track.id)}
      style={[styles.row, isActive ? styles.rowActive : null]}
    >
      <View style={styles.rowHeader}>
        <Text style={styles.title}>{track.title}</Text>
        <Text style={styles.duration}>{track.duration}</Text>
      </View>
      <View style={styles.rowMeta}>
        <Text style={styles.artist}>{track.artist}</Text>
        <Text style={styles.metaText}>{track.key}</Text>
        <Text style={styles.metaText}>{track.bpm} BPM</Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  row: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
  },
  rowActive: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    marginRight: 12,
  },
  duration: {
    color: "#94a3b8",
    fontSize: 12,
  },
  rowMeta: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  artist: {
    color: "#cbd5f5",
    flex: 1,
  },
  metaText: {
    color: "#94a3b8",
    fontSize: 12,
    textTransform: "uppercase",
  },
});
