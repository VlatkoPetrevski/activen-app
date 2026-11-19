import { ValidationError } from "@activen/db";
import { Body, Query, type PipeTransform } from "@nestjs/common";
import { ApiBody } from "@nestjs/swagger";
import { z } from "zod";

type SchemaObject = NonNullable<
  Extract<Parameters<typeof ApiBody>[0], { schema?: unknown }>["schema"]
>;

/** Validates and parses input with a zod schema; failures become 422 problem details. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const parsed = this.schema.safeParse(value ?? {});
    if (parsed.success) return parsed.data;
    throw new ValidationError(
      "Request validation failed",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
}

/** `@ValidBody(schema)` — parsed request body. */
export const ValidBody = (schema: z.ZodType) => Body(new ZodPipe(schema));

/** OpenAPI request body generated from the same zod schema. */
export const ApiZodBody = (schema: z.ZodType) =>
  ApiBody({ schema: z.toJSONSchema(schema, { io: "input" }) as SchemaObject });

/** `@ValidQuery(schema)` — parsed query string. */
export const ValidQuery = (schema: z.ZodType) => Query(new ZodPipe(schema));
