import { ICopilot } from "@metad/contracts";

export function getCopilotModel(copilot: ICopilot) {
    return copilot.copilotModel?.model || copilot.copilotModel?.referencedModel?.model
}