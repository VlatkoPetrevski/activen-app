import "reflect-metadata";
import { Module, VersioningType, type DynamicModule, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { randomUUID } from "node:crypto";
import { LoggerModule, Logger as PinoLogger } from "nestjs-pino";
import type { AppConfig } from "./config.js";
import { DatabaseModule } from "./database.module.js";
import { HealthController } from "./health/health.controller.js";
import { ProblemFilter } from "./problem.filter.js";
import { ReferenceController } from "./reference/reference.controller.js";
import { APP_CONFIG } from "./tokens.js";

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
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
      ],
      controllers: [HealthController, ReferenceController],
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}

/** Builds the configured application (used by main.ts and by the e2e tests). */
export async function createApp(config: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(config), { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.enableCors({ origin: config.CORS_ORIGINS, credentials: true });
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();

  const openApi = new DocumentBuilder()
    .setTitle("ActiveN API")
    .setDescription("Training planning, coach–athlete workplace and multi-vendor analytics")
    .setVersion("0.1.0")
    .build();
  SwaggerModule.setup("docs", app, () => SwaggerModule.createDocument(app, openApi), {
    jsonDocumentUrl: "docs/openapi.json",
  });
  return app;
}
