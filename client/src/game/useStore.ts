import { useSyncExternalStore } from "react";
import { client, type UiState } from "./client.ts";
import { settings, type Settings } from "./settings.ts";
import { progress, type Progress } from "./progress.ts";

export function useProgress(): Progress {
  return useSyncExternalStore(progress.subscribe, progress.get);
}

/** Subscribe to a slice of UI state; re-renders only when the selected value changes identity. */
export function useUi<T>(select: (s: UiState) => T): T {
  return useSyncExternalStore(client.ui.subscribe, () => select(client.ui.get()));
}

export function useSettings(): Settings {
  return useSyncExternalStore(settings.subscribe, settings.get);
}
