import { isFit, parseFit } from "./fit.js";
import { ImportError, MAX_FILE_BYTES, type FileFormat, type ImportedActivity } from "./model.js";
import { parseGpx, parseTcx } from "./xml.js";

export * from "./model.js";
export { garminProductName } from "./fit.js";
export { haversine, simplifyRoute, trackOf } from "./derive.js";
export { fitActivityType, textActivityType } from "./sport.js";

const decoder = new TextDecoder("utf-8");
const BOM = /^\uFEFF/;

/**
 * The format of a file by its content (the name is only a hint: phones rename files, and a
 * ".fit" can arrive as ".bin"). FIT has a binary ".FIT" header; GPX and TCX are XML.
 */
export function detectFormat(bytes: Uint8Array): FileFormat | null {
  if (isFit(bytes)) return "fit";
  const head = decoder.decode(bytes.subarray(0, 2048)).replace(BOM, "");
  if (!/^\s*</.test(head)) return null;
  if (/<gpx[\s>]/i.test(head)) return "gpx";
  if (/<TrainingCenterDatabase[\s>]/i.test(head)) return "tcx";
  return null;
}

/** Reads one uploaded activity file; throws {@link ImportError} with a user-facing code. */
export function parseActivityFile(bytes: Uint8Array): ImportedActivity {
  if (bytes.length === 0) throw new ImportError("empty", "The file is empty");
  if (bytes.length > MAX_FILE_BYTES) throw new ImportError("too_large", "The file is too large");
  const format = detectFormat(bytes);
  switch (format) {
    case "fit":
      return parseFit(bytes);
    case "gpx":
      return parseGpx(decoder.decode(bytes));
    case "tcx":
      return parseTcx(decoder.decode(bytes));
    default:
      throw new ImportError("unsupported_format", "Not a FIT, GPX or TCX file");
  }
}
