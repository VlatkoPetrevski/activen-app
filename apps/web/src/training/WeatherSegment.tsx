import type { WeatherDto } from "@activen/contracts";
import {
  aqiLevel,
  outdoorSuitability,
  weatherCondition,
  type WeatherCondition,
} from "@activen/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useApi } from "../api/ApiContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { defaultPlace, requestDeviceLocation, type Place } from "../lib/location.js";
import { aqiColor, bestWindow, isNight } from "../lib/weather.js";
import { Icon, type IconName } from "../ui/Icon.js";
import { Segment } from "../ui/Segment.js";

const ICON: Record<WeatherCondition, IconName> = {
  clear: "sun",
  partly_cloudy: "partlyCloudy",
  cloudy: "cloud",
  fog: "fog",
  drizzle: "rain",
  rain: "rain",
  snow: "snow",
  thunderstorm: "storm",
};

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function WeatherIcon({
  code,
  isDay = true,
  size = 28,
}: {
  code: number;
  isDay?: boolean;
  size?: number;
}) {
  const c = weatherCondition(code);
  const name: IconName = c === "clear" && !isDay ? "moon" : ICON[c];
  const color =
    c === "clear" || c === "partly_cloudy"
      ? "var(--accent)"
      : c === "thunderstorm"
        ? "var(--bad)"
        : "var(--teal)";
  return (
    <span className="weather-icon" style={{ color }} aria-hidden>
      <Icon name={name} size={size} />
    </span>
  );
}

/** Temperature line with night shading, rain bars and an air-quality strip, hour by hour. */
function HourlyChart({ w, nowHour }: { w: WeatherDto; nowHour: number }) {
  const { t, f } = useI18n();
  const W = 600;
  const H = 170;
  const top = 26;
  const plotH = 86;
  const hours = w.hourly;
  if (hours.length === 0) return null;
  const temps = hours.map((h) => h.temperature);
  const lo = Math.min(...temps) - 1;
  const hi = Math.max(...temps) + 1;
  const x = (i: number) => (i + 0.5) * (W / hours.length);
  const y = (v: number) => top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const line = hours
    .map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h.temperature).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(hours.length - 1)},${top + plotH} L${x(0)},${top + plotH} Z`;
  const slot = W / hours.length;
  const maxI = temps.indexOf(Math.max(...temps));
  const minI = temps.indexOf(Math.min(...temps));
  const nowI = hours.findIndex((h) => h.hour === nowHour);
  const label = hours.map((h) => `${hh(h.hour)} ${f.temperature(h.temperature)}`).join(", ");
  return (
    <svg
      className="hourly"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${t("weather.hourly")}: ${label}`}
    >
      {hours.map((h, i) =>
        isNight(w, h.hour) ? (
          <rect
            key={`n${i}`}
            x={i * slot}
            y={top - 6}
            width={slot}
            height={plotH + 6}
            fill="var(--bg-sunken)"
          />
        ) : null,
      )}
      <path d={area} fill="var(--accent)" opacity={0.14} />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
      {hours.map((h, i) =>
        h.precipitationProbability ? (
          <rect
            key={`p${i}`}
            x={i * slot + slot * 0.25}
            y={top + plotH - (h.precipitationProbability / 100) * 30}
            width={slot * 0.5}
            height={(h.precipitationProbability / 100) * 30}
            fill="var(--teal)"
            opacity={0.45}
            rx={2}
          />
        ) : null,
      )}
      {[maxI, minI].map((i) => (
        <g key={`m${i}`}>
          <circle cx={x(i)} cy={y(temps[i] ?? 0)} r={3.5} fill="var(--accent)" />
          <text x={x(i)} y={y(temps[i] ?? 0) - 8} textAnchor="middle" className="hourly-temp">
            {f.temperature(temps[i] ?? 0)}
          </text>
        </g>
      ))}
      {nowI >= 0 && (
        <g>
          <line
            x1={x(nowI)}
            x2={x(nowI)}
            y1={top - 6}
            y2={top + plotH}
            stroke="var(--primary)"
            strokeDasharray="3 3"
          />
          <text x={x(nowI)} y={top - 10} textAnchor="middle" className="hourly-now">
            {t("weather.now")} {f.temperature(hours[nowI]?.temperature ?? 0)}
          </text>
        </g>
      )}
      {hours.map((h, i) => (
        <rect
          key={`a${i}`}
          x={i * slot + 1}
          y={top + plotH + 8}
          width={slot - 2}
          height={7}
          rx={2}
          fill={aqiColor(h.europeanAqi)}
        />
      ))}
      {hours.map((h, i) =>
        h.hour % 3 === 0 ? (
          <text key={`l${i}`} x={x(i)} y={H - 6} textAnchor="middle" className="hourly-hour">
            {String(h.hour).padStart(2, "0")}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function WeatherSegment({ timeZone }: { timeZone: string }) {
  const api = useApi();
  const { t, f } = useI18n();
  const queryClient = useQueryClient();
  const [place, setPlace] = useState<Place>(() => defaultPlace(timeZone));
  const [locationError, setLocationError] = useState(false);
  const query = useQuery({
    queryKey: ["weather", place.latitude, place.longitude],
    queryFn: () => api.weather(place),
    staleTime: 30 * 60_000,
  });
  const w = query.data;
  if (query.isPending) return <div className="segment skeleton" aria-hidden />;
  if (!w)
    return (
      <div className="segment">
        <div className="segment-head static small muted">{t("weather.unavailable")}</div>
      </div>
    );

  const nowHour = new Date().getHours();
  const nowAqi = w.airQuality?.europeanAqi ?? null;
  const verdict = outdoorSuitability({
    apparentTemperature: w.current.apparentTemperature,
    precipitationProbability: w.today.precipitationProbabilityMax,
    condition: weatherCondition(w.current.weatherCode),
    windSpeedKmh: w.current.windSpeedKmh,
    europeanAqi: nowAqi,
    uvIndex: w.today.uvIndexMax,
  });
  const window = bestWindow(w, nowHour);
  const condition = t(`weather.condition.${weatherCondition(w.current.weatherCode)}`);
  const aqiText = nowAqi === null ? null : t(`weather.aqi.${aqiLevel(nowAqi)}`);
  const outdoorClass = verdict.level === "great" ? "good" : verdict.level === "ok" ? "warn" : "bad";

  const locateMe = async () => {
    setLocationError(false);
    try {
      const next = await requestDeviceLocation();
      setPlace(next);
      await queryClient.invalidateQueries({ queryKey: ["weather"] });
    } catch {
      setLocationError(true);
    }
  };

  return (
    <Segment
      label={`${condition}, ${f.temperature(w.current.temperature)}`}
      srTitle={condition}
      summary={
        <span className="weather-row">
          <WeatherIcon code={w.current.weatherCode} isDay={w.current.isDay} />
          <span className="weather-temp num">{f.temperature(w.current.temperature)}</span>
          <span className="small muted num">
            ↓{f.temperature(w.today.min)} ↑{f.temperature(w.today.max)}
          </span>
          <span className="weather-chips">
            {aqiText && (
              <span className="chip">
                <span className="dot" style={{ background: aqiColor(nowAqi) }} />
                {t("weather.aqi")}: {aqiText}
              </span>
            )}
            <span className={`chip ${outdoorClass}`}>
              {t("weather.outdoor")}: {t(`weather.outdoor.${verdict.level}`)}
            </span>
          </span>
        </span>
      }
    >
      <div className="stack">
        <div className="row-between wrap">
          <span className="small">
            <strong>{condition}</strong> ·{" "}
            {t("weather.feelsLike", { value: f.temperature(w.current.apparentTemperature) })}
          </span>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void locateMe()}>
            <Icon name="pin" size={16} /> {w.location.name ?? t("weather.here")}
          </button>
        </div>
        {locationError && (
          <p className="tiny muted">
            {t("weather.locationFailed", { place: w.location.name ?? "" })}
          </p>
        )}
        <div>
          <span className="eyebrow">{t("weather.hourly")}</span>
          <HourlyChart w={w} nowHour={nowHour} />
        </div>
        <div className="mini-stats">
          <div>
            <Icon name="wind" size={18} />
            <span className="num">{f.windSpeed(w.current.windSpeedKmh)}</span>
            <span className="tiny muted">{t("weather.wind")}</span>
          </div>
          <div>
            <Icon name="sunrise" size={18} />
            <span className="num">{w.today.sunrise}</span>
            <span className="tiny muted">{t("weather.sunrise")}</span>
          </div>
          <div>
            <Icon name="sunset" size={18} />
            <span className="num">{w.today.sunset}</span>
            <span className="tiny muted">{t("weather.sunset")}</span>
          </div>
          <div>
            <Icon name="rain" size={18} />
            <span className="num">{f.percent(w.today.precipitationProbabilityMax ?? 0)}</span>
            <span className="tiny muted">{t("weather.precip")}</span>
          </div>
          <div>
            <Icon name="sun" size={18} />
            <span className="num">{w.today.uvIndexMax ?? "—"}</span>
            <span className="tiny muted">{t("weather.uv")}</span>
          </div>
        </div>
        <div
          className={`alert ${verdict.level === "great" ? "success" : verdict.level === "ok" ? "info" : "error"}`}
        >
          <strong>
            {t("weather.outdoor")}: {t(`weather.outdoor.${verdict.level}`)}
          </strong>
          {verdict.reasons.map((r) => (
            <div key={r} className="small">
              {t(`weather.reason.${r}`)}
            </div>
          ))}
          {window && (
            <div className="small">
              {t("weather.bestWindow", { from: hh(window.from), to: hh(window.to) })}
            </div>
          )}
        </div>
        {w.airQuality && (
          <p className="tiny muted">
            {t("weather.aqi")}: {aqiText} (EAQI {w.airQuality.europeanAqi}) ·{" "}
            {t("weather.particles", {
              pm25: w.airQuality.pm2_5 === null ? "—" : Math.round(w.airQuality.pm2_5),
              pm10: w.airQuality.pm10 === null ? "—" : Math.round(w.airQuality.pm10),
            })}{" "}
            · {t("weather.source")}
          </p>
        )}
      </div>
    </Segment>
  );
}
