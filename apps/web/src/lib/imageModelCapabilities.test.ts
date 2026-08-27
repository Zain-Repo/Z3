import { assert, describe, it } from "@effect/vitest";

import {
  clampEnumValue,
  clampNumberValue,
  countOptionsFor,
  referenceImageBounds,
} from "./imageModelCapabilities";

describe("image model capability helpers", () => {
  it("keeps valid enum values and falls back to the first accepted value", () => {
    assert.equal(clampEnumValue({ type: "enum", values: ["low", "medium"] }, "low"), "low");
    assert.equal(clampEnumValue({ type: "enum", values: ["low", "medium"] }, "auto"), "low");
    assert.equal(clampEnumValue(undefined, "auto"), "auto");
    assert.equal(
      clampEnumValue({ type: "boolean" }, "auto"),
      "auto",
    );
  });

  it("clamps numeric fields into the model's range", () => {
    assert.equal(clampNumberValue({ type: "range", min: 1, max: 1 }, 4, 1, 10), 1);
    assert.equal(clampNumberValue({ type: "range", min: 0, max: 100 }, 150, 0, 100), 100);
    assert.equal(clampNumberValue(undefined, 4, 1, 10), 4);
  });

  it("exposes image counts that respect the model's n range", () => {
    assert.deepEqual(countOptionsFor({ type: "range", min: 1, max: 1 }), [1]);
    assert.deepEqual(countOptionsFor({ type: "range", min: 1, max: 10 }), [1, 2, 3, 4]);
    assert.deepEqual(countOptionsFor(undefined), [1]);
  });

  it("reports reference-image minimums and maximums", () => {
    assert.deepEqual(
      referenceImageBounds({ type: "range", min: 1, max: 10 }),
      { min: 1, max: 10 },
    );
    assert.deepEqual(referenceImageBounds({ type: "range", min: 0, max: 4 }), {
      min: 0,
      max: 4,
    });
    assert.deepEqual(referenceImageBounds(undefined), { min: 0, max: 4 });
  });
});
