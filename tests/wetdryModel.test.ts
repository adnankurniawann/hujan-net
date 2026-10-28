import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { loadWetDryModel } from "../lib/ml/loadOperator.ts";
import { wetDryLogit } from "../lib/ml/wetdry.ts";

const model = loadWetDryModel();

test("lintasan maju LSTM di TS sama dengan PyTorch", () => {
  const { check } = JSON.parse(readFileSync("data/ml-wetdry.json", "utf8"));
  const x = Array.from({ length: model.window }, (_, i) => [check.x[2 * i], check.x[2 * i + 1]] as [number, number]);
  assert.ok(Math.abs(wetDryLogit(model, x, check.meta) - check.logit) < 1e-4);
});
