import { ACTIVITY_TYPE_INFO, ACTIVITY_TYPES } from "@activen/domain";
import {
  createTranslator,
  garminTerm,
  labels,
  negotiateLocale,
  SUPPORTED_LOCALES,
} from "@activen/i18n";
import { Controller, Get, Headers, Query } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators.js";

/**
 * Public reference data for clients: supported languages and localized activity types.
 * Language: `?locale=` → `Accept-Language` → mk (ADR-0008).
 */
@ApiTags("reference")
@Public()
@Controller({ path: "reference", version: "1" })
export class ReferenceController {
  @Get("locales")
  @ApiOperation({ summary: "Supported UI languages" })
  locales() {
    return { locales: SUPPORTED_LOCALES, default: negotiateLocale({}) };
  }

  @Get("activity-types")
  @ApiOperation({ summary: "Garmin activity types with localized names and groups" })
  @ApiQuery({ name: "locale", required: false, enum: SUPPORTED_LOCALES })
  @ApiHeader({ name: "Accept-Language", required: false })
  activityTypes(
    @Query("locale") locale?: string,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    const resolved = negotiateLocale({
      userPreference: locale ?? null,
      acceptLanguage: acceptLanguage ?? null,
    });
    const t = createTranslator(resolved);
    return {
      locale: resolved,
      items: ACTIVITY_TYPES.map((code) => ({
        code,
        group: ACTIVITY_TYPE_INFO[code].group,
        name: labels.activityType(t, code),
        groupName: labels.activityGroup(t, ACTIVITY_TYPE_INFO[code].group),
        garminName: garminTerm(`activityType.${code}`),
      })),
    };
  }
}
