jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { projectPipelineConfigurationSchema } from '@xpert-ai/contracts'
import { ProjectPipelineRuntimeAdapterRegistry } from '@xpert-ai/plugin-sdk'
import { XpertProject } from '../../entities/project.entity'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { ProjectPipelineConfigurationService } from '../configuration/project-pipeline-configuration.service'
import { ProjectPipelineManagedStartService } from './pipeline-managed-start.service'
import { ProjectPipelineCoordinatorService } from './pipeline-coordinator.service'
import { ProjectPipelineAssistantBridgeService } from './pipeline-assistant-bridge.service'
import { ProjectPipelineRuntimeBridgeService } from './pipeline-runtime-bridge.service'

it('rejects a saved configuration for another project type before calling any runtime adapter', async () => {
    const proposal = JSON.parse(
        readFileSync(
            resolve(__dirname, '../../../../../../docs/plans/project-pipeline/code-review-pipeline.proposed.json'),
            'utf8'
        )
    )
    const configuration = projectPipelineConfigurationSchema.parse({
        template: proposal.template,
        binding: proposal.binding,
        schemaVersion: 1
    })
    const read = jest
        .fn()
        .mockResolvedValueOnce({ definitionId: randomUUID(), configuration: configuration.binding })
        .mockResolvedValueOnce({ definition: configuration.template })
    const adapter = jest.fn()
    const transaction = jest.fn()
    const access = { assertEdit: jest.fn().mockResolvedValue({ applicationKey: 'sample:bom', projectTypeKey: 'case' }) }
    const module = await Test.createTestingModule({
        providers: [
            ProjectPipelineManagedStartService,
            {
                provide: getRepositoryToken(XpertProject),
                useValue: { manager: { findOneByOrFail: read, transaction } }
            },
            { provide: ProjectAccessRuntimeService, useValue: access },
            { provide: ProjectPipelineConfigurationService, useValue: {} },
            { provide: ProjectPipelineRuntimeAdapterRegistry, useValue: { resolve: adapter } },
            { provide: ProjectPipelineCoordinatorService, useValue: {} },
            { provide: ProjectPipelineAssistantBridgeService, useValue: {} },
            { provide: ProjectPipelineRuntimeBridgeService, useValue: {} }
        ]
    }).compile()
    try {
        await expect(
            module
                .get(ProjectPipelineManagedStartService)
                .start(
                    { projectId: randomUUID(), actor: { tenantId: randomUUID(), userId: randomUUID() } },
                    { bindingId: randomUUID(), triggerKey: 'manual:review', objectKey: 'pr:1', title: 'Review' }
                )
        ).rejects.toMatchObject({ response: { code: 'PIPELINE_PROJECT_TYPE_MISMATCH' } })
        expect(access.assertEdit).toHaveBeenCalledTimes(1)
        expect(adapter).not.toHaveBeenCalled()
        expect(transaction).not.toHaveBeenCalled()
    } finally {
        await module.close()
    }
})
