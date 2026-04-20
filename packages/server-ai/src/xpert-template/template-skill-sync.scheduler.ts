import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { TemplateSkillSyncService } from './template-skill-sync.service'

@Injectable()
export class TemplateSkillSyncScheduler {
	readonly #logger = new Logger(TemplateSkillSyncScheduler.name)

	constructor(private readonly templateSkillSyncService: TemplateSkillSyncService) {}

	@Cron('0 */10 * * * *')
	async reconcileTenantSkillAssets() {
		try {
			await this.templateSkillSyncService.reconcileTenantsFromTemplates()
		} catch (error) {
			this.#logger.error(
				`Failed to reconcile template skill assets: ${error instanceof Error ? error.message : error}`,
				error instanceof Error ? error.stack : undefined
			)
		}
	}
}
