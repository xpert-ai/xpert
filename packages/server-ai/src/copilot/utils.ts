import { ICopilot } from "@xpert-ai/contracts";

export function getCopilotModel(copilot: ICopilot) {
    return copilot.copilotModel?.model || copilot.copilotModel?.referencedModel?.model
}