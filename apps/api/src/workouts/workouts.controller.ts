import { WorkoutStructureRequest } from "@activen/contracts/requests";
import type { WorkoutStructure } from "@activen/domain";
import { Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import { WORKOUT_AI } from "../tokens.js";
import { ApiZodBody, ValidBody } from "../validation.js";
import { structureWorkout, type WorkoutAi } from "./structurer.js";

/** "Структурирај": a suggested structure for a plan text. Nothing is saved here. */
@ApiTags("workouts")
@ApiBearerAuth()
@Controller({ path: "workouts", version: "1" })
export class WorkoutsController {
  constructor(@Inject(WORKOUT_AI) private readonly ai: WorkoutAi | null) {}

  @Post("structure")
  @HttpCode(200)
  @ApiOperation({ summary: "Suggest a structured workout for a plan text (parser, then AI)" })
  @ApiZodBody(WorkoutStructureRequest)
  async structure(
    @ValidBody(WorkoutStructureRequest) body: z.output<typeof WorkoutStructureRequest>,
  ): Promise<{ structure: WorkoutStructure | null }> {
    // null: nothing structured in the text — the plan simply stays free text.
    return { structure: await structureWorkout(body.text, body.locale ?? "mk", this.ai) };
  }
}
