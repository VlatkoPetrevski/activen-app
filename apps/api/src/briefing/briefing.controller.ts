import { BriefingQuery, MorningInput } from "@activen/contracts/requests";
import type { BriefingDto } from "@activen/contracts";
import { isLocalDate } from "@activen/domain";
import { BadRequestException, Controller, Get, Inject, Param, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import type { AuthContext } from "../auth/auth.types.js";
import { CurrentAuth } from "../auth/decorators.js";
import { ApiZodBody, ValidBody, ValidQuery } from "../validation.js";
import { BriefingService } from "./briefing.service.js";

/** The signed-in athlete's morning briefing and morning input. */
@ApiTags("briefing")
@ApiBearerAuth()
@Controller({ path: "me", version: "1" })
export class BriefingController {
  constructor(@Inject(BriefingService) private readonly briefings: BriefingService) {}

  @Get("briefing")
  @ApiOperation({ summary: "Readiness and the advice for today's session (or ?date=)" })
  @ApiQuery({ name: "date", required: false, example: "2026-11-21" })
  briefing(
    @CurrentAuth() a: AuthContext,
    @ValidQuery(BriefingQuery) q: z.output<typeof BriefingQuery>,
  ): Promise<BriefingDto> {
    return this.briefings.briefing(a.userId, q.date);
  }

  @Put("wellness/:date")
  @ApiOperation({
    summary: "Morning input: measured sleep and resting pulse (both null removes it)",
  })
  @ApiZodBody(MorningInput)
  morningInput(
    @CurrentAuth() a: AuthContext,
    @Param("date") date: string,
    @ValidBody(MorningInput) body: z.output<typeof MorningInput>,
  ): Promise<BriefingDto> {
    if (!isLocalDate(date)) throw new BadRequestException("date must be YYYY-MM-DD");
    return this.briefings.saveMorningInput(a.userId, date, body);
  }
}
