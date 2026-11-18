import { ping, type Database } from "@activen/db";
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Res,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { DATABASE } from "../tokens.js";
import { Public } from "../auth/decorators.js";

/** Kubernetes-style probes: liveness never touches dependencies, readiness checks the database. */
@ApiTags("health")
@Public()
@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  @Get("live")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Liveness: the process is running" })
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness: dependencies (PostgreSQL) are reachable" })
  async ready(@Res({ passthrough: true }) res: Response) {
    const database = await ping(this.database.pool);
    if (!database) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: database ? "ok" : "unavailable",
      checks: { database: database ? "ok" : "down" },
    };
  }
}
