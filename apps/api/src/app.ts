import "reflect-metadata";
import { Module, VersioningType, type DynamicModule, type INestApplication } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import cookieParser from "cookie-parser";
import type { Express } from "express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { randomUUID } from "node:crypto";
import { LoggerModule, Logger as PinoLogger } from "nestjs-pino";
import type { AppConfig } from "./config.js";
import { DatabaseModule } from "./database.module.js";
import { AuthController, WellKnownController } from "./auth/auth.controller.js";
import { AuthGuard } from "./auth/auth.guard.js";
import { AuthService } from "./auth/auth.service.js";
import { IdTokenVerifier, remoteIdTokenKeys, type IdTokenKeys } from "./auth/id-token.verifier.js";
import { LogMailer, type Mailer } from "./auth/mailer.js";
import { TokenService } from "./auth/token.service.js";
import { HealthController } from "./health/health.controller.js";
import { MeController } from "./me/me.controller.js";
import { AthleteController } from "./training/athlete.controller.js";
import { CoachController } from "./training/coach.controller.js";
import { TrainingService } from "./training/training.service.js";
import { ProblemFilter } from "./problem.filter.js";
import { ReferenceController } from "./reference/reference.controller.js";
import { APP_CONFIG, ID_TOKEN_VERIFIER, MAILER, TOKEN_SERVICE, WORKOUT_AI } from "./tokens.js";
import { AnthropicWorkoutAi, type WorkoutAi } from "./workouts/structurer.js";
import { WorkoutsController } from "./workouts/workouts.controller.js";

/** Replaceable collaborators (tests use local keys and a capturing mailer). */
export interface AppOverrides {
  idTokenKeys?: IdTokenKeys;
  mailer?: Mailer;
  /** Workout AI for tests (null = off). */
  workoutAi?: WorkoutAi | null;
}

@Module({})
export class AppModule {
  static forRoot(config: AppConfig, overrides: AppOverrides = {}): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: config.LOG_LEVEL,
            genReqId: (req, res) => {
              const incoming = req.headers["x-request-id"];
              const id =
                typeof incoming === "string" && incoming.length <= 128 ? incoming : randomUUID();
              res.setHeader("x-request-id", id);
              return id;
            },
            // Never log credentials or tokens.
            redact: [
              "req.headers.authorization",
              "req.headers.cookie",
              'res.headers["set-cookie"]',
            ],
          },
        }),
        DatabaseModule.forRoot(),
        ThrottlerModule.forRoot({
          throttlers: [
            { name: "default", ttl: 60_000, limit: config.RATE_LIMIT_PER_MINUTE },
            {
              name: "auth",
              ttl: 60_000,
              limit: config.AUTH_RATE_LIMIT_PER_MINUTE,
              skipIf: (ctx) => ctx.getClass() !== AuthController,
            },
          ],
        }),
      ],
      controllers: [
        HealthController,
        ReferenceController,
        AuthController,
        WellKnownController,
        MeController,
        AthleteController,
        CoachController,
        WorkoutsController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: TOKEN_SERVICE, useFactory: () => TokenService.create(config) },
        {
          provide: ID_TOKEN_VERIFIER,
          useFactory: () =>
            new IdTokenVerifier(overrides.idTokenKeys ?? remoteIdTokenKeys(), {
              google: config.GOOGLE_CLIENT_IDS,
              apple: config.APPLE_CLIENT_IDS,
            }),
        },
        {
          provide: MAILER,
          useValue: overrides.mailer ?? new LogMailer(config.NODE_ENV !== "production"),
        },
        AuthService,
        TrainingService,
        {
          provide: WORKOUT_AI,
          useValue:
            overrides.workoutAi !== undefined
              ? overrides.workoutAi
              : config.ACTIVEN_AI_API_KEY && config.ACTIVEN_AI_MODEL
                ? new AnthropicWorkoutAi(config.ACTIVEN_AI_API_KEY, config.ACTIVEN_AI_MODEL)
                : null,
        },
        // Order matters: rate limiting runs before authentication.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
      exports: [APP_CONFIG],
    };
  }
}

/** Builds the configured application (used by main.ts and by the e2e tests). */
export async function createApp(
  config: AppConfig,
  overrides: AppOverrides = {},
): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(config, overrides), { bufferLogs: true });
  (app.getHttpAdapter().getInstance() as Express).set("trust proxy", config.TRUST_PROXY_HOPS);
  app.use(cookieParser());
  app.useLogger(app.get(PinoLogger));
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.enableCors({ origin: config.CORS_ORIGINS, credentials: true });
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();

  const openApi = new DocumentBuilder()
    .setTitle("ActiveN API")
    .setDescription("Training planning, coach–athlete workplace and multi-vendor analytics")
    .setVersion("0.2.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("docs", app, () => SwaggerModule.createDocument(app, openApi), {
    jsonDocumentUrl: "docs/openapi.json",
  });
  return app;
}
