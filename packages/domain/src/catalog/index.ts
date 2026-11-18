import {
  CATALOG,
  CATALOG_VENDORS,
  type CatalogField,
  type CatalogVendor,
  type Domain,
} from "./fields.js";
import { TRANSFORMS } from "./transforms.js";

export * from "./fields.js";
export * from "./sports.js";
export * from "./transforms.js";

const BY_KEY: ReadonlyMap<string, CatalogField> = new Map(CATALOG.map((f) => [f.key, f]));

export function catalogField(key: string): CatalogField | undefined {
  return BY_KEY.get(key);
}

export function fieldsByDomain(domain: Domain): CatalogField[] {
  return CATALOG.filter((f) => f.domain === domain);
}

export interface VendorCoverage {
  vendor: CatalogVendor;
  documented: number;
  fitProfile: number;
  toConfirm: number;
  /** Fields with no mapping for this vendor (excluding other vendors' proprietary fields). */
  missing: number;
}

/** How much of the canonical model a vendor can fill. */
export function vendorCoverage(vendor: CatalogVendor): VendorCoverage {
  const cov: VendorCoverage = { vendor, documented: 0, fitProfile: 0, toConfirm: 0, missing: 0 };
  for (const f of CATALOG) {
    if (f.origin !== "common" && f.origin !== vendor) continue;
    const m = f.mappings[vendor];
    if (!m) {
      if (f.origin === "common") cov.missing += 1;
      continue;
    }
    if (m.status === "documented") cov.documented += 1;
    else if (m.status === "fit_profile") cov.fitProfile += 1;
    else cov.toConfirm += 1;
  }
  return cov;
}

/** Structural checks of the catalog itself; run in tests and CI. */
export function validateCatalog(fields: readonly CatalogField[] = CATALOG): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const f of fields) {
    if (seen.has(f.key)) errors.push(`${f.key}: duplicate key`);
    seen.add(f.key);
    if (!/^[a-z_]+\.[a-z][A-Za-z0-9]*$/.test(f.key))
      errors.push(`${f.key}: key must be <summary_type>.<camelCaseField>`);
    if (!f.label.trim()) errors.push(`${f.key}: label required`);
    const vendors = Object.keys(f.mappings) as CatalogVendor[];
    for (const v of vendors) {
      if (!CATALOG_VENDORS.includes(v)) errors.push(`${f.key}: unknown vendor ${v}`);
      const m = f.mappings[v];
      if (m && !TRANSFORMS.includes(m.transform)) errors.push(`${f.key}: unknown transform`);
      if (m && !m.path.trim()) errors.push(`${f.key}: empty path for ${v}`);
    }
    if (f.origin === "activen" && vendors.length > 0)
      errors.push(`${f.key}: ActiveN-computed field must not map vendors`);
    if (f.origin !== "common" && f.origin !== "activen") {
      if (vendors.some((v) => v !== f.origin))
        errors.push(`${f.key}: proprietary ${f.origin} field mapped from another vendor`);
      if (!vendors.includes(f.origin))
        errors.push(`${f.key}: proprietary field without its vendor`);
    }
    if (f.origin === "common" && vendors.length === 0)
      errors.push(`${f.key}: common field without any vendor mapping`);
  }
  return errors;
}
