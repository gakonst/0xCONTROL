import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  fetchCatalogTracks,
  type Track,
  type TrackLoadState,
} from "./src/api/catalog";
import { TrackRow } from "./src/components/TrackRow";

const EMPTY_TRACKS: Track[] = [];

export default function App() {
  const [tracks, setTracks] = useState<Track[]>(EMPTY_TRACKS);
  const [loadState, setLoadState] = useState<TrackLoadState>("idle");
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      setLoadState("loading");
      setErrorMessage(null);

      try {
        const result = await fetchCatalogTracks();
        if (!isActive) return;
        setTracks(result);
        setLoadState("ready");
        if (!activeTrackId && result.length) {
          setActiveTrackId(result[0].id);
        }
      } catch (error) {
        if (!isActive) return;
        setLoadState("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load tracks.",
        );
      }
    };

    void load();

    return () => {
      isActive = false;
    };
  }, [activeTrackId]);

  const activeTrack = useMemo(() => {
    if (!activeTrackId) return null;
    return tracks.find((track) => track.id === activeTrackId) ?? null;
  }, [activeTrackId, tracks]);

  const handleTrackPress = useCallback((trackId: string) => {
    setActiveTrackId(trackId);
  }, []);

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>Zero Control</Text>
      <Text style={styles.subtitle}>Mobile Library</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      {header}
      {loadState === "loading" && (
        <View style={styles.centered}>
          <ActivityIndicator color="#67e8f9" size="large" />
          <Text style={styles.mutedText}>Loading tracks...</Text>
        </View>
      )}
      {loadState === "error" && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Unable to load tracks.</Text>
          {errorMessage ? (
            <Text style={styles.mutedText}>{errorMessage}</Text>
          ) : null}
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setLoadState("idle")}
          >
            <Text style={styles.retryText}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      )}
      {loadState === "ready" && (
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              isActive={item.id === activeTrackId}
              onPress={handleTrackPress}
            />
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.mutedText}>No tracks found.</Text>
            </View>
          }
        />
      )}
      {activeTrack && loadState === "ready" ? (
        <View style={styles.player}>
          <View style={styles.playerInfo}>
            <Text style={styles.playerTitle}>{activeTrack.title}</Text>
            <Text style={styles.playerSubtitle}>{activeTrack.artist}</Text>
          </View>
          <View style={styles.playerMeta}>
            <Text style={styles.playerMetaText}>{activeTrack.key}</Text>
            <Text style={styles.playerMetaText}>{activeTrack.bpm} BPM</Text>
            <Text style={styles.playerMetaText}>{activeTrack.duration}</Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
  },
  title: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: "#94a3b8",
    marginTop: 4,
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 140,
  },
  centered: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  mutedText: {
    color: "#94a3b8",
  },
  errorText: {
    color: "#f87171",
    fontWeight: "600",
  },
  retryButton: {
    borderWidth: 1,
    borderColor: "#38bdf8",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  retryText: {
    color: "#38bdf8",
  },
  player: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: "#0f172a",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  playerInfo: {
    marginBottom: 12,
  },
  playerTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "600",
  },
  playerSubtitle: {
    color: "#94a3b8",
    marginTop: 4,
  },
  playerMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  playerMetaText: {
    color: "#cbd5f5",
    fontSize: 12,
    textTransform: "uppercase",
  },
});
