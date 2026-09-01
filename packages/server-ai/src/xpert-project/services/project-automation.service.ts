import { IXpertProjectAutomation } from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { GoneException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { XpertProjectAutomation } from '../entities/project-automation.entity'
import { XpertProjectAutomationRun } from '../entities/project-automation-run.entity'
import { t } from 'i18next'

export const XPERT_PROJECT_AUTOMATION_QUEUE = 'xpert-project-automation'
export const XPERT_PROJECT_AUTOMATION_PLUGIN = '@xpert-ai/platform'

@Injectable()
export class XpertProjectAutomationService extends TenantOrganizationAwareCrudService<XpertProjectAutomation> {
    constructor(
        @InjectRepository(XpertProjectAutomation) repository: Repository<XpertProjectAutomation>,
        @InjectRepository(XpertProjectAutomationRun)
        private readonly runRepository: Repository<XpertProjectAutomationRun>
    ) {
        super(repository)
    }

    list(projectId: string, options: { includeRuns?: boolean } = {}) {
        return this.findAll({
            where: { projectId },
            ...(options.includeRuns ? { relations: ['runs'] } : {}),
            order: { createdAt: 'DESC' }
        })
    }

    async createAutomation(
        _projectId: string,
        _input: Partial<IXpertProjectAutomation>
    ): Promise<XpertProjectAutomation> {
        throw legacyProjectAutomationDisabled()
    }

    async updateAutomation(
        _projectId: string,
        _automationId: string,
        _input: Partial<IXpertProjectAutomation>
    ): Promise<XpertProjectAutomation> {
        throw legacyProjectAutomationDisabled()
    }

    async removeAutomation(_projectId: string, _automationId: string): Promise<void> {
        throw legacyProjectAutomationDisabled()
    }

    async run(
        _projectId: string,
        _automationId: string,
        _occurrenceKey = `${_automationId}:${Date.now()}`
    ): Promise<XpertProjectAutomationRun> {
        throw legacyProjectAutomationDisabled()
    }

    listRuns(projectId: string, automationId?: string) {
        return this.runRepository.find({
            where: { projectId, ...(automationId ? { automationId } : {}) },
            order: { createdAt: 'DESC' },
            take: 100
        })
    }

    async triggerEvent(
        _projectId: string,
        _eventType: Exclude<IXpertProjectAutomation['trigger']['type'], 'schedule'>,
        _entityId?: string
    ) {
        return []
    }
}

function legacyProjectAutomationDisabled() {
    return new GoneException(
        t('server-ai:Error.LegacyProjectAutomationDisabled', {
            defaultValue: 'Legacy Project automations are disabled. Recreate this automation as a scheduled Xpert task.'
        })
    )
}
