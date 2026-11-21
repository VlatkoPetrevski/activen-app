/** Injection tokens (explicit tokens keep DI independent of emitted decorator metadata). */
export const APP_CONFIG = Symbol("APP_CONFIG");
export const DATABASE = Symbol("DATABASE");
export const REPOSITORIES = Symbol("REPOSITORIES");
export const TOKEN_SERVICE = Symbol("TOKEN_SERVICE");
export const ID_TOKEN_VERIFIER = Symbol("ID_TOKEN_VERIFIER");
export const MAILER = Symbol("MAILER");
/** Optional AI that structures workout texts the parser does not understand (null = off). */
export const WORKOUT_AI = Symbol("WORKOUT_AI");
/** Where original uploaded activity files are kept (local disk, object storage, memory in tests). */
export const FILE_STORE = Symbol("FILE_STORE");
/** Polar AccessLink client (null when Polar is not configured). */
export const POLAR_CLIENT = Symbol("POLAR_CLIENT");
/** Encrypts vendor tokens and signs OAuth state (null without ACTIVEN_TOKEN_KEY). */
export const TOKEN_CIPHER = Symbol("TOKEN_CIPHER");
