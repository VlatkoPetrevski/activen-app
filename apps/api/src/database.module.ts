import { createDatabase, createRepositories, type Database } from "@activen/db";
import {
  Global,
  Inject,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { AppConfig } from "./config.js";
import { APP_CONFIG, DATABASE, REPOSITORIES } from "./tokens.js";

@Global()
@Module({})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DATABASE,
          inject: [APP_CONFIG],
          useFactory: (config: AppConfig) =>
            createDatabase({
              connectionString: config.DATABASE_URL,
              max: config.DATABASE_POOL_MAX,
              applicationName: "activen-api",
            }),
        },
        {
          provide: REPOSITORIES,
          inject: [DATABASE],
          useFactory: (database: Database) => createRepositories(database.db),
        },
      ],
      exports: [DATABASE, REPOSITORIES],
    };
  }

  /** Graceful shutdown: drain the pool when the process receives SIGTERM. */
  async onApplicationShutdown(): Promise<void> {
    await this.database.close();
  }
}
