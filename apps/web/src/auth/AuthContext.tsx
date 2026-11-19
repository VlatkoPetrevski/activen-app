import type { MeDto } from "@activen/contracts";
import { isLocale } from "@activen/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useApi } from "../api/ApiContext.js";
import { useI18n } from "../i18n/I18nContext.js";

type Status = "loading" | "signedOut" | "signedIn";

interface Auth {
  status: Status;
  me: MeDto | null;
  /** Reloads the profile (after sign-in or profile changes). */
  reload(): Promise<MeDto | null>;
  signOut(): Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { setLocale, setUnitSystem } = useI18n();
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<MeDto | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await api.me();
      setMe(next);
      setStatus("signedIn");
      if (next.settings.locale && isLocale(next.settings.locale)) setLocale(next.settings.locale);
      setUnitSystem(next.settings.unitSystem);
      return next;
    } catch {
      setMe(null);
      setStatus("signedOut");
      return null;
    }
  }, [api, setLocale, setUnitSystem]);

  useEffect(() => {
    let active = true;
    void api.restoreSession().then((ok) => {
      if (!active) return;
      if (ok) void reload();
      else setStatus("signedOut");
    });
    return () => {
      active = false;
    };
    // Restore once per app start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const signOut = useCallback(async () => {
    await api.signOut().catch(() => undefined);
    queryClient.clear();
    setMe(null);
    setStatus("signedOut");
  }, [api, queryClient]);

  return <Ctx.Provider value={{ status, me, reload, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

/** The signed-in profile (only inside authenticated routes). */
export function useMe(): MeDto {
  const { me } = useAuth();
  if (!me) throw new Error("useMe without a signed-in user");
  return me;
}
