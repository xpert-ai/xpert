import { codingToolBrand } from '../../../../shared/coding-tools/branding'

export function executionProviderLabel(attempt: { runtimeToolId?: string; runtimeProvider?: string }) {
    if (attempt.runtimeProvider === 'xpert-task') return 'Assistant'
    return (
        codingToolBrand({ toolId: attempt.runtimeToolId, provider: attempt.runtimeProvider })?.name ??
        attempt.runtimeProvider
    )
}
