import { ICopilot } from '@xpert-ai/contracts'

export function getCopilotModel(copilot: ICopilot) {
    return copilot.copilotModel?.model || copilot.copilotModel?.referencedModel?.model
}

export function usesOrganizationCredentials(
    copilot: Pick<ICopilot, 'modelProvider'>,
    organizationId?: string | null
): boolean {
    const provider = copilot.modelProvider
    return !!(
        organizationId &&
        provider?.organizationId === organizationId &&
        provider.isValid !== false &&
        provider.credentials &&
        Object.keys(provider.credentials).length
    )
}
