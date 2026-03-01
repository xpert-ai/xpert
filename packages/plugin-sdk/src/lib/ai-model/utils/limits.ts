import { BaseLanguageModel, getModelContextSize as _getModelContextSize } from "@langchain/core/language_models/base";
import { ICopilotModel, ModelPropertyKey } from "@metad/contracts";
import { ModelProfile } from "../types";

export function getModelContextSize(input: BaseLanguageModel | ICopilotModel): number | undefined {
  if (isCopilotModel(input)) {
    return normalizeContextSize(input.options?.[ModelPropertyKey.CONTEXT_SIZE]);
  }

  // Backward compatibility for langchain <1.0.0
  if (input.metadata && "profile" in input.metadata) {
    const profile = input.metadata['profile'] as ModelProfile;
    if ("maxInputTokens" in profile && (typeof profile.maxInputTokens === "number" || profile.maxInputTokens == null)) {
      return (profile.maxInputTokens as number) ?? undefined;
    }
  }
  // Langchain v1.0.0+
  if (
    "profile" in input &&
    typeof input.profile === "object" &&
    input.profile &&
    "maxInputTokens" in input.profile &&
    (typeof input.profile.maxInputTokens === "number" ||
      input.profile.maxInputTokens == null)
  ) {
    return (input.profile.maxInputTokens as number) ?? undefined;
  }

  if ("model" in input && typeof input.model === "string") {
    return _getModelContextSize(input.model);
  }
  if ("modelName" in input && typeof input.modelName === "string") {
    return _getModelContextSize(input.modelName);
  }

  return undefined;
}

function isCopilotModel(input: BaseLanguageModel | ICopilotModel): input is ICopilotModel {
  return typeof input === "object" && input !== null && !("invoke" in input);
}

export function normalizeContextSize(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}
