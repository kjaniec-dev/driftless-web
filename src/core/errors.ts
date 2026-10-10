export type ValidationIssue =
  | { readonly code: "no_targets" }
  | { readonly code: "invalid_isin"; readonly isin: string }
  | { readonly code: "invalid_amount"; readonly field: "cash" | "position"; readonly isin?: string }
  | { readonly code: "invalid_weight"; readonly isin: string }
  | { readonly code: "weights_sum"; readonly sum: number }
  | { readonly code: "duplicate_position"; readonly isin: string }
  | { readonly code: "duplicate_target"; readonly isin: string }
  | { readonly code: "total_not_positive" };

/** Domain-level problems (bad weights, duplicate ISINs, negative amounts, ...). */
export class PortfolioValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(`Invalid portfolio: ${issues.map((i) => i.code).join(", ")}`);
    this.name = "PortfolioValidationError";
    this.issues = issues;
  }
}

/** Structural problems in a CLI `portfolio.json` file; `path` is a JSON-pointer-like location. */
export class CliFormatError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${message} at ${path}`);
    this.name = "CliFormatError";
    this.path = path;
  }
}
