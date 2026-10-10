/** Domain model. Mirrors `driftless.models` from the Python CLI (all amounts in PLN). */

export interface Position {
  readonly isin: string;
  readonly valuePln: number;
  readonly label?: string | undefined;
}

export interface Target {
  readonly isin: string;
  /** Fraction of the portfolio in (0, 1], e.g. 0.3 for 30%. */
  readonly weight: number;
}

export interface Portfolio {
  readonly baseCurrency: "PLN";
  readonly cashPln: number;
  readonly positions: readonly Position[];
  readonly targets: readonly Target[];
  readonly asOf?: string | undefined;
}

export interface BuyOrder {
  readonly isin: string;
  readonly label: string | null;
  readonly currentPln: number;
  readonly targetPln: number;
  readonly currentWeight: number;
  readonly targetWeight: number;
  readonly driftPp: number;
  readonly buyPln: number;
  readonly afterWeight: number;
  readonly driftAfterPp: number;
}

/** Structured so the UI can localise them; `formatWarningEn` reproduces the CLI wording. */
export type PlanWarning =
  | { readonly code: "not_in_target"; readonly isin: string }
  | { readonly code: "cash_constrained"; readonly cashPln: number };

export interface RebalancePlan {
  readonly totalPln: number;
  readonly positionsPln: number;
  readonly cashPln: number;
  readonly orders: readonly BuyOrder[];
  readonly cashDeployed: number;
  readonly leftoverCash: number;
  readonly warnings: readonly PlanWarning[];
}
