import { ForbiddenException } from '@nestjs/common'
import type { AnalyticsBinding, AnalyticsQueryRequest, ResourceAnalysisPolicy } from '@xpert-ai/contracts'
import { resolveAnalyticsParameters } from '@xpert-ai/plugin-sdk/analytics'
import { t } from 'i18next'

export function assertDelegatedAnalysisControls(
    scope: ResourceAnalysisPolicy['datasets'][number],
    controls: AnalyticsQueryRequest['controls'],
    defaults: AnalyticsQueryRequest['controls'],
    binding: AnalyticsBinding
) {
    // Compare resolved native parameters: omitted controls use the fixed version's defaults,
    // while only explicitly consented controls may vary within their enumerated values.
    const baseline = { ...defaults }
    for (const [key, values] of Object.entries(scope.controlValues ?? {})) baseline[key] = values[0]
    const parameters = resolveAnalyticsParameters(binding, controls)
    const fixed = resolveAnalyticsParameters(binding, baseline)
    for (const parameter of binding.parameters) {
        const values = scope.controlValues?.[parameter.controlId]
        if (
            values ? !values.includes(parameters[parameter.name]) : parameters[parameter.name] !== fixed[parameter.name]
        )
            throw new ForbiddenException(t('server-ai:Error.ResourceAnalysisDenied'))
    }
}
