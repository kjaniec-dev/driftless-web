"""Generate golden reference cases by running the real Driftless CLI engine.

Usage:
    python3 -I scripts/generate-golden.py /path/to/driftless/src [/path/to/driftless/.git-dir-or-repo]

Writes tests/golden/engine.golden.json. The TypeScript engine must reproduce every
value bit-for-bit (see tests/core/golden.test.ts). Regenerate only when the Python
engine's behaviour intentionally changes, and commit the result.
"""

import json
import random
import subprocess
import sys
from pathlib import Path

src = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(src))

from driftless.engine import compute_plan  # noqa: E402
from driftless.models import Portfolio, Position, Target  # noqa: E402


def isin(i: int) -> str:
    return f"IE00B5BMR{i:03d}"[:11] + str(i % 10)


def case(name, cash, positions, targets):
    portfolio = Portfolio(
        base_currency="PLN",
        cash_pln=cash,
        positions=tuple(Position(i, v, lab) for i, v, lab in positions),
        targets=tuple(Target(i, w) for i, w in targets),
    )
    plan = compute_plan(portfolio)
    return {
        "name": name,
        "input": {
            "cash_pln": cash,
            "positions": [
                {"isin": i, "value_pln": v, **({"label": lab} if lab else {})}
                for i, v, lab in positions
            ],
            "target": [{"isin": i, "weight": w} for i, w in targets],
        },
        "expected": {
            "total_pln": plan.total_pln,
            "positions_pln": plan.positions_pln,
            "cash_pln": plan.cash_pln,
            "cash_deployed": plan.cash_deployed,
            "leftover_cash": plan.leftover_cash,
            "warnings": list(plan.warnings),
            "orders": [
                {
                    "isin": o.isin,
                    "label": o.label,
                    "current_pln": o.current_pln,
                    "target_pln": o.target_pln,
                    "current_weight": o.current_weight,
                    "target_weight": o.target_weight,
                    "drift_pp": o.drift_pp,
                    "buy_pln": o.buy_pln,
                    "after_weight": o.after_weight,
                    "drift_after_pp": o.drift_after_pp,
                }
                for o in plan.orders
            ],
        },
    }


A, B, C, D = "IE00BK5BQT80", "IE00B4L5Y983", "IE00B5BMR087", "IE00BKM4GZ66"
cases = [
    # Hand-picked: the CLI's own test scenarios and sample files.
    case("two-etf basic", 5000.0, [(A, 45000, "VWCE"), (B, 30000, "IWDA")], [(A, 0.6), (B, 0.4)]),
    case(
        "four-etf example",
        500.0,
        [("IE00B5BMR087", 3400, "SXR8"), ("IE0006WW1TQ4", 4300, "EXUS"),
         ("IE00BKM4GZ66", 1200, "IS3N"), ("IE00B4ND3602", 1100, "EGLN")],
        [("IE00B5BMR087", 0.30), ("IE0006WW1TQ4", 0.40), ("IE00BKM4GZ66", 0.15), ("IE00B4ND3602", 0.15)],
    ),
    case("cash limits rebalance", 2500.0, [(A, 45000, "VWCE"), (B, 30000, "IWDA")], [(A, 0.6), (B, 0.4)]),
    case("float-noise gap equals cash", 3333.33, [(A, 1000.1, None), (B, 2000.2, None)], [(A, 1 / 3), (B, 2 / 3)]),
    case("missing target leg", 1000.0, [(A, 90000, "VWCE")], [(A, 0.5), (B, 0.5)]),
    case("single asset at target, zero cash", 0.0, [(A, 100000, "VWCE")], [(A, 1.0)]),
    case("cash only", 1000.0, [], [(A, 0.7), (B, 0.3)]),
    case("position outside target", 1000.0,
         [(A, 5000, "VWCE"), (B, 3000, "IWDA"), (C, 2000, "SXR8")], [(A, 0.5), (B, 0.5)]),
    case("thirds rounding to grosze", 100.0, [(A, 0, None), (B, 0, None), (C, 0, None)],
         [(A, 1 / 3), (B, 1 / 3), (C, 1 / 3)]),
    case("overweight everywhere but one", 10.0, [(A, 9000, None), (B, 100, None), (C, 900, None)],
         [(A, 0.2), (B, 0.4), (C, 0.4)]),
    case("exact ties", 300.0, [(A, 0, None), (B, 0, None), (C, 0, None), (D, 0, None)],
         [(A, 0.25), (B, 0.25), (C, 0.25), (D, 0.25)]),
    case("tiny amounts", 0.03, [(A, 0.01, None), (B, 0.02, None)], [(A, 0.5), (B, 0.5)]),
    case("cash exceeds all gaps", 100000.0, [(A, 100, None), (B, 100, None)], [(A, 0.5), (B, 0.5)]),
    case("only off-target positions", 500.0, [(C, 1000, None)], [(A, 0.5), (B, 0.5)]),
]

rng = random.Random(20261010)
for n in range(700):
    k = rng.choice([1, 2, 2, 3, 3, 4, 5, 6, 8, 12, 25] if n % 50 else [60])
    isins = [isin(i) for i in range(k)]
    kind = rng.choice(["uniform", "ties", "lumpy"])
    if kind == "ties":
        weights = [1.0] * k
    elif kind == "lumpy":
        weights = [rng.choice([1, 1, 2, 5, 10]) for _ in range(k)]
    else:
        weights = [rng.random() + 0.01 for _ in range(k)]
    norm = sum(weights)
    targets = [(i, w / norm) for i, w in zip(isins, weights)]
    scale = rng.choice([10, 1000, 100000, 5_000_000])
    held = rng.sample(isins, rng.randint(0, k))
    positions = [
        (i, round(rng.uniform(0, scale), rng.choice([0, 2, 2, 4])), f"L{n}-{j}" if rng.random() < 0.5 else None)
        for j, i in enumerate(held)
    ]
    if rng.random() < 0.2:  # an extra holding outside the target
        positions.append(("US0378331005", round(rng.uniform(0, scale), 2), "OFF"))
    cash = round(rng.choice([0.0, 0.01, rng.uniform(0, scale / 5), rng.uniform(0, scale * 2)]), 2)
    if cash + sum(v for _, v, _ in positions) <= 0:
        cash = 1.0
    cases.append(case(f"random-{n}-{kind}-k{k}", cash, positions, targets))

try:
    sha = subprocess.run(
        ["git", "-C", str(src.parent), "rev-parse", "HEAD"], capture_output=True, text=True
    ).stdout.strip()
except OSError:
    sha = ""

out = {
    "generatedBy": "scripts/generate-golden.py",
    "python": sys.version.split()[0],
    "driftlessCommit": sha,
    "cases": cases,
}
dest = Path(__file__).resolve().parent.parent / "tests" / "golden" / "engine.golden.json"
dest.write_text(json.dumps(out, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"wrote {len(cases)} cases to {dest}")
