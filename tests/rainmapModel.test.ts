import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { loadRainMapModel } from "../lib/ml/loadOperator.ts";
import { rainMapForward } from "../lib/ml/rainmap.ts";

test("lintasan maju MLP peta hujan di TS sama dengan PyTorch", () => {
  const { check } = JSON.parse(readFileSync("data/ml-rainmap.json", "utf8"));
  assert.ok(Math.abs(rainMapForward(loadRainMapModel(), check.x) - check.y) < 1e-4);
});
