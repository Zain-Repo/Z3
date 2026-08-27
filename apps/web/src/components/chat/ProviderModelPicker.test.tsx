import { describe, expect, it } from "vite-plus/test";
import { shouldReopenModelConfigurationAfterSelection } from "./ProviderModelPicker";

describe("shouldReopenModelConfigurationAfterSelection", () => {
  it("reopens the configuration surface when model options are rendered", () => {
    expect(shouldReopenModelConfigurationAfterSelection([])).toBe(true);
  });

  it("keeps option-less pickers closing after selection", () => {
    expect(shouldReopenModelConfigurationAfterSelection(undefined)).toBe(false);
    expect(shouldReopenModelConfigurationAfterSelection(null)).toBe(false);
  });
});
