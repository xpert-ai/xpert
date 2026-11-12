import { ForbiddenException } from '@nestjs/common'
import type { ResourceAnalysisDataset, AnalyticsValue } from '@xpert-ai/contracts'
import type { ArtifactVersionContext } from '@xpert-ai/plugin-sdk'
import { analyticsBindingSchema } from '@xpert-ai/plugin-sdk/analytics'
import { z } from 'zod/v3'
import { t } from 'i18next'
import { ArtifactTypesService } from '../types/artifact-types.service'

// Plugin output is a trust boundary. Native declarations remain server-only; descriptions use an explicit projection.
const bindingsSchema = z
    .array(
        z
            .object({
                binding: analyticsBindingSchema,
                title: z.string().min(1).max(160).optional()
            })
            .strict()
    )
    .superRefine((entries, context) => {
        if (new Set(entries.map((entry) => entry.binding.id)).size !== entries.length)
            context.addIssue({ code: 'custom', message: 'Duplicate artifact dataset key' })
    })

export async function resolveArtifactAnalytics(types: ArtifactTypesService, context: ArtifactVersionContext) {
    const provider = types.provider(context.artifact)
    const analytics = provider.analytics
    if (!analytics) throw new ForbiddenException(t('server-ai:Error.ResourceAnalysisUnsupported'))
    const recheck = () => {
        if (types.provider(context.artifact) !== provider || provider.analytics !== analytics)
            throw new ForbiddenException(t('server-ai:Error.ResourceAnalysisDenied'))
    }
    const parsed = bindingsSchema.safeParse(await analytics.resolveBindings(context))
    recheck()
    if (!parsed.success) throw new ForbiddenException(t('server-ai:Error.ResourceAnalysisInvalid'))
    const entries = parsed.data
    const datasets: ResourceAnalysisDataset[] = entries.map(({ binding, title }) => ({
        key: binding.id,
        title: title ?? binding.output.datasetId,
        fields: binding.output.fields,
        parameters: binding.parameters
    }))
    return {
        entries,
        datasets,
        recheck,
        normalizeControls: async (key: string, controls: Record<string, AnalyticsValue>) => {
            recheck()
            const normalized = analytics.normalizeControls
                ? await analytics.normalizeControls(context, key, controls)
                : controls
            recheck()
            return normalized
        }
    }
}
