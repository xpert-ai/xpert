import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectPipelineConfigurationSchema, type ProjectPipelineEvidenceRef } from '@xpert-ai/contracts'
import { ProjectPipelineRuntimeAdapterRegistry } from '@xpert-ai/plugin-sdk'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { ProjectPipelineDecisionService } from './pipeline-decision.service'
import { ProjectPipelineCoordinatorService } from './pipeline-coordinator.service'
import { ProjectPipelineEvidenceService } from './pipeline-evidence.service'
import { ProjectPipelineAttentionEntity, ProjectPipelineDecisionEntity } from '../persistence/pipeline.entity'
import { pipelineInputs } from './pipeline-inputs'

jest.mock('../../services/project-access-runtime.service', () => ({ ProjectAccessRuntimeService: class {} }))
jest.mock('./pipeline-coordinator.service', () => ({ ProjectPipelineCoordinatorService: class {} }))
jest.mock('./pipeline-inputs', () => ({ pipelineInputs: jest.fn() }))
jest.mock('./pipeline-transaction', () => ({ lockManagedProject: jest.fn(), managedAudit: () => ({}) }))
jest.mock('../persistence/pipeline-human-wait-snapshot', () => ({ capturePipelineHumanWaitSnapshot: async () => ({ nodeIds: [] }) }))
jest.mock('../../services/task-projection/project-task-projection.writer', () => ({ projectionScope: () => ({}) }))
jest.mock('../persistence/pipeline.entity', () => ({
  ProjectPipelineAttentionEntity: class ProjectPipelineAttentionEntity {},
  ProjectPipelineNodeEntity: class ProjectPipelineNodeEntity {},
  ProjectPipelineRoundEntity: class ProjectPipelineRoundEntity {},
  ProjectPipelineRunEntity: class ProjectPipelineRunEntity {},
  ProjectPipelineDefinitionEntity: class ProjectPipelineDefinitionEntity {},
  ProjectPipelineDecisionEntity: class ProjectPipelineDecisionEntity {},
  ProjectPipelineInstanceEntity: class ProjectPipelineInstanceEntity {},
  ProjectPipelineEventEntity: class ProjectPipelineEventEntity {}
}))

describe('native approval input snapshot', () => {
  const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }, c = { actor, projectId: randomUUID() }
  const reference: ProjectPipelineEvidenceRef = { resolverRef: 'fixture.request@1', schemaRef: 'fixture.schema@1',
    objectKey: 'candidate', version: '1', digest: 'a'.repeat(64), producerOperationId: randomUUID() }
  const raw = JSON.parse(readFileSync(resolve(__dirname, '../../../../../../docs/plans/project-pipeline/code-review-pipeline.proposed.json'), 'utf8'))
  const config = projectPipelineConfigurationSchema.parse({ schemaVersion: 1, template: raw.template, binding: raw.binding })
  const attentionId = randomUUID(), roundId = randomUUID(), instanceId = randomUUID(), nodeId = randomUUID()
  const input = { requestId: randomUUID(), attentionId, expectedRevision: 1, inputDigest: 'b'.repeat(64),
    generation: 1, outcome: 'accepted', evidence: [] }
  let service: ProjectPipelineDecisionService, saved: ProjectPipelineDecisionEntity | null
  let authorize: jest.Mock, insert: jest.Mock
  beforeEach(async () => {
    jest.clearAllMocks(); saved = null
    const attention = { id: attentionId, roundId, instanceId, nodeInstanceId: nodeId, kind: 'human', state: 'open',
      revision: 1, inputDigest: input.inputDigest, generation: 1 }
    const node = { id: nodeId, nodeKey: 'approve', projection: { state: { readiness: 'ready', freshness: 'current' } } }
    const find = async (type: { name: string }) => {
      switch (type.name) {
        case 'ProjectPipelineAttentionEntity': return attention
        case 'ProjectPipelineNodeEntity': return node
        case 'ProjectPipelineRoundEntity': return { id: roundId, runId: randomUUID(), inputDigest: input.inputDigest,
          generation: 1, subjectVersionSet: [], state: 'active' }
        case 'ProjectPipelineRunEntity': return { id: randomUUID(), definitionId: randomUUID(), bindingSnapshot: config.binding }
        case 'ProjectPipelineDefinitionEntity': return { definition: config.template }
        case 'ProjectPipelineDecisionEntity': return saved
        case 'ProjectPipelineInstanceEntity': return { id: instanceId, currentRoundId: roundId, revision: 1 }
        default: throw Error(type.name)
      }
    }
    insert = jest.fn(async (type: { name: string }, value: ProjectPipelineDecisionEntity) => {
      if (type.name === 'ProjectPipelineDecisionEntity') saved = value
    })
    const transaction = { findOneBy: find, findOneByOrFail: find, save: jest.fn(), insert }
    const manager = { ...transaction, transaction: async (fn: (m: typeof transaction) => Promise<unknown>) => fn(transaction) }
    jest.mocked(pipelineInputs).mockResolvedValue({ request: { kind: 'evidence', value: reference } })
    authorize = jest.fn(async () => true)
    const module = await Test.createTestingModule({ providers: [ProjectPipelineDecisionService,
      { provide: getRepositoryToken(ProjectPipelineAttentionEntity), useValue: { manager, findOneByOrFail: async () => attention } },
      { provide: ProjectAccessRuntimeService, useValue: { assertEdit: async () => ({ role: 'owner' }) } },
      { provide: ProjectPipelineRuntimeAdapterRegistry, useValue: { resolve: () => ({ authorizeDecision: authorize }) } },
      { provide: ProjectPipelineEvidenceService, useValue: { inputs: jest.fn(), verify: jest.fn() } },
      { provide: ProjectPipelineCoordinatorService, useValue: { advanceWithinTransaction: jest.fn() } }
    ] }).compile()
    service = module.get(ProjectPipelineDecisionService)
  })
  it('persists the exact presented input even when the user supplies no attachment', async () => {
    await service.decide(c, input)
    expect(saved?.evidence).toEqual([reference])
    expect(authorize.mock.calls[0][1].evidence).toEqual([])
  })
  it('replays the same decision idempotently after capturing its input', async () => {
    const first = await service.decide(c, input)
    expect(await service.decide(c, input)).toEqual(first)
    expect(insert.mock.calls.filter(([type]) => type.name === 'ProjectPipelineDecisionEntity')).toHaveLength(1)
  })
  it('refuses a gate input changed between policy verification and the locked commit', async () => {
    jest.mocked(pipelineInputs).mockResolvedValueOnce({ request: { kind: 'evidence', value: reference } })
      .mockResolvedValueOnce({ request: { kind: 'evidence', value: { ...reference, digest: 'c'.repeat(64) } } })
    await expect(service.decide(c, input)).rejects.toMatchObject({ response: { code: 'DECISION_VERSION_CONFLICT' } })
    expect(saved).toBeNull()
  })
  it('never overwrites an existing decision with a different candidate', async () => {
    await service.decide(c, input)
    jest.mocked(pipelineInputs).mockResolvedValue({ request: { kind: 'evidence', value: { ...reference, digest: 'c'.repeat(64) } } })
    await expect(service.decide(c, input)).rejects.toMatchObject({ response: { code: 'DECISION_ALREADY_RECORDED' } })
    expect(saved?.evidence).toEqual([reference])
  })
})
