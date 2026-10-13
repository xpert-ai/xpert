// Template installs share tenant skill indexes and workspace skill files. Serialize the
// resource phase across workers; waiting must release the business database connection.
import { Inject, Injectable } from '@nestjs/common'
import { IXpert, TemplateDependencyLock } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource, QueryRunner } from 'typeorm'
import { setTimeout } from 'node:timers/promises'
import { t } from 'i18next'
import { PluginResourceInstallerService, RuntimeComponent } from '../plugin-resource-installer.service'
import { TemplateReadinessService } from './template-readiness.service'

@Injectable()
export class TemplateDependencyInstaller {
    constructor(
        @Inject(DataSource) private readonly database: Pick<DataSource, 'createQueryRunner'>,
        @Inject(PluginResourceInstallerService)
        private readonly installer: Pick<PluginResourceInstallerService, 'installComponentsForXpert'>,
        @Inject(TemplateReadinessService)
        private readonly readiness: Pick<TemplateReadinessService, 'assertDependencies'>
    ) {}

    async install(xpert: IXpert, components: RuntimeComponent[], locks: TemplateDependencyLock[]) {
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) throw new Error(t('server-ai:Error.TemplateRequirementsUnmet'))
        if (!components.length) return this.installer.installComponentsForXpert(xpert, components)
        const runner = await this.acquire(tenantId)
        try {
            await this.readiness.assertDependencies(locks)
            return await this.installer.installComponentsForXpert(xpert, components)
        } finally {
            try {
                await runner.query('SELECT pg_advisory_unlock(hashtext($1), hashtext($2))', [
                    'template-dependencies',
                    tenantId
                ])
            } finally {
                await runner.release()
            }
        }
    }

    private async acquire(tenantId: string): Promise<QueryRunner> {
        const deadline = Date.now() + 120_000
        while (Date.now() < deadline) {
            const runner = this.database.createQueryRunner()
            try {
                await runner.connect()
                const rows: { locked: boolean }[] = await runner.query(
                    'SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS locked',
                    ['template-dependencies', tenantId]
                )
                if (rows[0]?.locked) return runner
            } catch (error) {
                await runner.release()
                throw error
            }
            await runner.release()
            await setTimeout(100)
        }
        throw new Error(t('server-ai:Error.TemplateDependencyBusy'))
    }
}
