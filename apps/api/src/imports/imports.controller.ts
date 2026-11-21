import type { ImportResultDto, ImportsSummaryDto } from "@activen/contracts";
import { MAX_FILE_BYTES } from "@activen/importers";
import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  UnprocessableEntityException,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthContext } from "../auth/auth.types.js";
import { CurrentAuth } from "../auth/decorators.js";
import { ImportService } from "./import.service.js";

/** Files per upload; the web app sends a folder of activities in batches of this size. */
export const MAX_FILES_PER_UPLOAD = 20;

interface MulterFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

/** Uploading activity files (FIT, GPX, TCX) recorded by a watch or exported from an app. */
@ApiTags("imports")
@ApiBearerAuth()
@Controller({ path: "me", version: "1" })
export class ImportsController {
  constructor(@Inject(ImportService) private readonly imports: ImportService) {}

  @Post("activities/import")
  @HttpCode(200)
  // Rate-limited by the "imports" throttler (IMPORT_RATE_LIMIT_PER_MINUTE).
  @UseInterceptors(
    FilesInterceptor("files", MAX_FILES_PER_UPLOAD, {
      // Over-sized files are reported per file ("too_large") instead of failing the whole upload.
      limits: { fileSize: MAX_FILE_BYTES + 1, files: MAX_FILES_PER_UPLOAD },
    }),
  )
  @ApiOperation({
    summary: "Import FIT/GPX/TCX files; the same workout is never stored or shown twice",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { files: { type: "array", items: { type: "string", format: "binary" } } },
    },
  })
  async import(
    @CurrentAuth() a: AuthContext,
    @UploadedFiles() files: MulterFile[] | undefined,
  ): Promise<{ results: ImportResultDto[] }> {
    if (!files?.length) throw new UnprocessableEntityException("No files in field 'files'");
    const results = await this.imports.importFiles(
      a.userId,
      files.map((f) => ({
        // Multer decodes multipart file names as Latin-1; browsers send UTF-8 (Cyrillic names).
        fileName: Buffer.from(f.originalname, "latin1").toString("utf8"),
        bytes: new Uint8Array(f.buffer.buffer, f.buffer.byteOffset, f.buffer.byteLength),
      })),
    );
    return { results };
  }

  @Get("imports")
  @ApiOperation({ summary: "How many files were imported, and the latest attempts" })
  summary(@CurrentAuth() a: AuthContext): Promise<ImportsSummaryDto> {
    return this.imports.summary(a.userId);
  }
}
