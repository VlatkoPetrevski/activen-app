import { ConflictError, NotFoundError, ValidationError } from "@activen/db";
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";

/** RFC 9457 problem details for every error; internal errors never leak their message. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger("ProblemFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const { status, title, detail, extra } = this.describe(exception);
    if (status >= 500)
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res
      .status(status)
      .type("application/problem+json")
      .json({ type: "about:blank", title, status, detail, instance: req.originalUrl, ...extra });
  }

  private describe(e: unknown): { status: number; title: string; detail?: string; extra?: object } {
    if (e instanceof NotFoundError) return { status: 404, title: "Not Found", detail: e.message };
    if (e instanceof ConflictError) return { status: 409, title: "Conflict", detail: e.message };
    if (e instanceof ValidationError)
      return {
        status: 422,
        title: "Unprocessable Entity",
        detail: e.message,
        extra: { errors: e.details },
      };
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const body = e.getResponse();
      const detail = typeof body === "string" ? body : (body as { message?: unknown }).message;
      return {
        status,
        title: HttpStatus[status]?.replace(/_/g, " ") ?? "Error",
        ...(detail !== undefined
          ? { detail: Array.isArray(detail) ? detail.join("; ") : String(detail) }
          : {}),
      };
    }
    return { status: 500, title: "Internal Server Error", detail: "Unexpected error" };
  }
}
