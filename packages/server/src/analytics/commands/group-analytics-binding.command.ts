import { Command } from '@nestjs/cqrs'
import type { AnalyticsBinding, AnalyticalDataset, AnalyticsQueryRequest } from '@xpert-ai/contracts'
import type { AnalyticsResolvedSource, DataSourceActor } from '@xpert-ai/plugin-sdk'

/** Host-only resolution of a published binding through accepted analysis consent; callers never supply native queries. */
export class GroupAnalyticsBindingCommand extends Command<{
	binding: AnalyticsBinding
	/** Optional grant-authorized fixed source resolution; omission uses ordinary source ACL resolution. */
	source?: AnalyticsResolvedSource
	/** Domain parameter defaults/constraints from the same fixed version; runtime parameter checks still apply. */
	normalizeControls(controls: AnalyticsQueryRequest['controls']): Promise<AnalyticsQueryRequest['controls']>
	/** Apply the accepted immutable row/field scope before passing normalized data to analysis consumers. */
	project(dataset: AnalyticalDataset): AnalyticalDataset
	/** Recheck live grant/reference/provider state before execution and before releasing its result. */
	revalidate(): Promise<void>
}> {
	constructor(
		readonly actor: DataSourceActor,
		readonly groupId: string,
		readonly referenceId: string,
		readonly datasetKey: string
	) {
		super()
	}
}
