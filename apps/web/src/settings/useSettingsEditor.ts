import type { AthleteSettings } from "@activen/domain";
import { useCallback, useState } from "react";
import type { SettingsInput } from "../api/api.js";
import { useApi } from "../api/ApiContext.js";
import { useAuth, useMe } from "../auth/AuthContext.js";

/**
 * Editing the signed-in user's settings from any screen. Changes are optimistic: they show at
 * once, are saved, and are rolled back (with `error` set) when saving fails. Every settings form
 * uses this hook, so new settings only need a field, not a new save flow.
 */
export function useSettingsEditor() {
  const api = useApi();
  const me = useMe();
  const { reload } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<SettingsInput | null>(null);

  const save = useCallback(
    async (patch: SettingsInput) => {
      setSaving(true);
      setError(false);
      setPending((p) => ({ ...p, ...patch }));
      try {
        await api.updateSettings(patch);
        await reload();
      } catch {
        setError(true);
      } finally {
        setPending(null);
        setSaving(false);
      }
    },
    [api, reload],
  );

  const settings = { ...me.settings, ...pending } as AthleteSettings;
  return { settings, save, saving, error };
}

export type SettingsEditor = ReturnType<typeof useSettingsEditor>;
