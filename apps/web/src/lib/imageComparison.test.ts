import { describe, expect, it } from "vite-plus/test";
import { ProviderInstanceId, type ImageGenerationInput } from "@t3tools/contracts";
import { comparisonInputs, runImageComparison } from "./imageComparison";

const inputs: ReadonlyArray<ImageGenerationInput> = [
  { model: "openai/image", prompt: "Old prompt", n: 2, provider: { only: ["provider"] } },
  {
    model: "civitai/z-image-base",
    providerInstanceId: ProviderInstanceId.make("civitai"),
    prompt: "Other prompt",
    seed: 42,
    civitai: { checkpoint: "checkpoint" },
  },
];

describe("image model comparison", () => {
  it("shares the submitted prompt while preserving independent provider settings", () => {
    const result = comparisonInputs(inputs, "  Shared prompt  ");
    expect(result).toEqual(inputs.map((input) => ({ ...input, prompt: "Shared prompt" })));
    expect(inputs[0]?.prompt).toBe("Old prompt");
  });

  it("rejects empty prompts, invalid counts and duplicate models before sending requests", () => {
    expect(() => comparisonInputs(inputs, " ")).toThrow("Enter a prompt");
    expect(() => comparisonInputs(inputs.slice(0, 1), "Prompt")).toThrow("between 2 and 4");
    expect(() => comparisonInputs([...inputs, ...inputs, ...inputs], "Prompt")).toThrow(
      "between 2 and 4",
    );
    expect(() => comparisonInputs([inputs[0]!, inputs[0]!], "Prompt")).toThrow("unique");
  });

  it("starts every model and delivers a success even when another model fails", async () => {
    const started: string[] = [];
    const successes: string[] = [];
    const settled: string[] = [];
    const failures = await runImageComparison(
      inputs,
      new AbortController().signal,
      async (input) => {
        started.push(input.model);
        if (input === inputs[0]) throw new Error("Provider unavailable");
        return input.model;
      },
      (result) => successes.push(result),
      (input) => settled.push(input.model),
    );
    expect(started).toEqual(inputs.map((input) => input.model));
    expect(successes).toEqual([inputs[1]!.model]);
    expect(settled).toHaveLength(2);
    expect(failures).toEqual(["openai/image: Provider unavailable"]);
  });

  it("ignores late results after cancellation", async () => {
    const controller = new AbortController();
    const successes: string[] = [];
    const settled: string[] = [];
    let resolve: (value: string) => void = () => {};
    const result = new Promise<string>((complete) => {
      resolve = complete;
    });
    const run = runImageComparison(
      inputs,
      controller.signal,
      () => result,
      (value) => successes.push(value),
      (input) => settled.push(input.model),
    );
    controller.abort();
    resolve("Late image");
    expect(await run).toEqual([]);
    expect(successes).toEqual([]);
    expect(settled).toEqual([]);
  });
});
