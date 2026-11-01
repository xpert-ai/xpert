// Invariants: an intent is saved with its installation, before Redis publication.
// Callers hold the shared store lease through publication and acknowledgement.
// A retry uses the same publication ID, including after an ambiguous Redis reply.
import { z } from 'zod'
import { Logger } from '@nestjs/common'
import type { PluginInstanceService } from '../plugin-instance.service'
import type { RuntimeControlService } from '../../runtime-control/runtime-control.service'
import type { PluginRuntimeChangeInput } from '../../runtime-control/runtime-restart.types'
import type { PluginStoreLease } from './plugin-store-lock'

export interface PluginRuntimePublication extends PluginRuntimeChangeInput {
	publicationId: string
}

const publicationSchema = z
	.object({
		publicationId: z.string().uuid(),
		pluginName: z.string().min(1),
		scopeKey: z.string().min(1),
		version: z.string().nullable().optional(),
		runtimeRevision: z.string().nullable().optional()
	})
	.strict()

const logger = new Logger('PluginPublication')

export async function publishCommittedPlugin(
	instances: PluginInstanceService,
	runtime: Pick<RuntimeControlService, 'recordPluginRuntimeChange'>,
	publication: PluginRuntimePublication,
	lease: PluginStoreLease
) {
	try {
		await lease.assertOwned()
		const result = await runtime.recordPluginRuntimeChange(publication)
		if (result.scheduled) {
			await lease.assertOwned()
			await instances.acknowledgeRuntimePublication(
				publication.scopeKey,
				publication.pluginName,
				publication.publicationId
			)
		}
		if (result.scheduled)
			logger.log(
				`Plugin publication acknowledged: ${publication.publicationId} ${publication.scopeKey} ${publication.pluginName}@${publication.version ?? 'unknown'} generation=${result.generation}`
			)
		return result
	} catch {
		// Do not log config/credentials or destroy a committed installation on transport failure.
		logger.warn(
			`Plugin publication pending: ${publication.publicationId} ${publication.scopeKey} ${publication.pluginName}`
		)
		return { scheduled: false, generation: 0 }
	}
}

export async function replayPluginPublications(
	instances: PluginInstanceService,
	runtime: Pick<RuntimeControlService, 'recordPluginRuntimeChange'>,
	lease: PluginStoreLease
) {
	for (const row of await instances.pendingRuntimePublications()) {
		if (!row.runtimePublication) continue
		const parsed = publicationSchema.parse(row.runtimePublication)
		const publication: PluginRuntimePublication = {
			publicationId: parsed.publicationId,
			pluginName: parsed.pluginName,
			scopeKey: parsed.scopeKey,
			version: parsed.version,
			runtimeRevision: parsed.runtimeRevision
		}
		if (publication.pluginName !== row.pluginName || publication.scopeKey !== row.scopeKey) {
			throw new Error('Plugin publication scope does not match its committed installation')
		}
		const result = await publishCommittedPlugin(instances, runtime, publication, lease)
		if (!result.scheduled) return false
	}
	return true
}
