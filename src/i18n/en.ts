export const en = {
  app: {
    name: "Driftless",
    tagline: "Rebalance your portfolio. Keep your data.",
    demoBanner: "Demo data. Nothing is saved to this device.",
    disclaimer:
      "Driftless is a mathematical planning tool, not investment advice. Amounts are a PLN plan, not guaranteed unit orders; broker settlement may differ.",
  },
  nav: {
    start: "Start",
    portfolio: "Portfolio",
    edit: "Instruments & targets",
    rebalance: "Rebalance",
    data: "Data & privacy",
    openGroup: "Workspace",
    language: "Language",
    theme: "Toggle dark mode",
  },
  start: {
    title: "Welcome to Driftless",
    description:
      "Work out how to spend new money so your ETF portfolio moves back toward its target weights, by buying only. No account, no tracking, no uploads.",
    privacyTitle: "Local-first by design",
    privacyBody:
      "Portfolios live only in this browser. There is no server-side storage of your holdings, and every calculation runs on your device.",
    demo: "Try the demo",
    newPortfolio: "New portfolio",
    importJson: "Import JSON",
    soon: "Coming in Phase 2",
  },
  portfolio: {
    title: "Portfolio",
    description: "Current valuation and allocation drift.",
    total: "Total value",
    invested: "Invested",
    cash: "Cash to invest",
    allocation: "Current allocation",
    instrument: "Instrument",
    value: "Value",
    current: "Current",
    target: "Target",
    drift: "Drift",
    asOf: "Valuation date",
    held: "Held, no target",
  },
  edit: {
    title: "Instruments & targets",
    description: "Add instruments by ISIN, enter current values and target weights.",
    emptyTitle: "The editor arrives in Phase 2",
    emptyBody: "Editing, storage in IndexedDB and import/export are next on the roadmap.",
  },
  rebalance: {
    title: "Rebalance",
    description: "Buy-only plan: spends new cash on the most underweight positions.",
    cash: "New cash to invest (PLN)",
    cashHint: "Type an amount such as 1500 or 1 500,50.",
    cashInvalid: "Enter a valid non-negative amount.",
    deployed: "To spend",
    leftover: "Left unspent",
    totalAfter: "Portfolio after purchase",
    buy: "Buy (PLN)",
    after: "After",
    driftAfter: "Drift after",
    planNote: "This is an amount plan in PLN, not an order for a number of units.",
    invalidPortfolio: "The portfolio is not valid",
    noPurchases: "No purchases suggested: nothing is underweight, or there is no cash.",
    warnings: {
      notInTarget: "Position {isin} is not in the target allocation. It is kept but never traded.",
      cashConstrained:
        "Purchases are limited by the available cash ({amount}). Targets cannot be fully reached.",
    },
  },
  data: {
    title: "Data & privacy",
    description: "What is stored, where, and how to keep a copy.",
    principlesTitle: "Our commitments",
    principles: [
      "No accounts, no advertising, no behavioural tracking.",
      "Holdings, values and account names never leave your browser.",
      "Calculations run locally and keep working offline once the app has loaded.",
      "Open source (MIT): you can read exactly what the app does.",
    ],
    storageTitle: "Browser storage can be erased",
    storageBody:
      "Clearing site data, private browsing or a browser clean-up can delete your portfolios. Export a backup file regularly and keep it somewhere safe.",
    backupSoon: "Backup export and import arrive in Phase 2.",
  },
  issues: {
    no_targets: "Add at least one target weight.",
    invalid_isin: "{isin} is not a valid ISIN format.",
    invalid_amount: "An amount is negative or not a number.",
    invalid_weight: "The weight for {isin} must be above 0% and at most 100%.",
    weights_sum: "Target weights must add up to 100% (currently {sum}).",
    duplicate_position: "ISIN {isin} appears twice in positions.",
    duplicate_target: "ISIN {isin} appears twice in the targets.",
    total_not_positive: "The portfolio total must be above zero.",
  },
};

type Widen<T> = T extends string
  ? string
  : T extends readonly string[]
    ? string[]
    : { [K in keyof T]: Widen<T[K]> };
export type Dictionary = Widen<typeof en>;
