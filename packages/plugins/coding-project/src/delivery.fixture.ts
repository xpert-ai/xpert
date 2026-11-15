import { createHash, randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import {
  DefaultRuntimeCapabilityRegistry,
  ProjectAccessRuntimeCapability,
  ProjectPipelinesRuntimeCapability,
  ProjectTasksRuntimeCapability,
  ArtifactsRuntimeCapability,
  ProjectPipelineEvidenceRuntimeCapability,
  ProjectPipelineCommandsRuntimeCapability,
  ProjectConfigurationRuntimeCapability,
  type ProjectConfigurationApi,
  type ProjectPipelineAssistantContext,
  type ProjectTaskAcceptanceReceipt,
  type ProjectTaskContext,
  type ArtifactsApi
} from '@xpert-ai/plugin-sdk'
import type { ProjectPipelineGraph, ProjectPipelineEvidenceRef } from '@xpert-ai/contracts'
import { CodingDelivery, CodingDeliveryWork } from './entities'
import { CodingDeliveryStore } from './store'
import { CodingEvidenceService } from './evidence'
import { CodingOperations, CodingReleasePolicy } from './adapters'
import { releaseRequirementSchema, configSchema, type Phase, type DeliveryMode } from './schemas'
import { TYPE, refs } from './constants'

const columns = {
  id: { type: 'varchar' as const, primary: true },
  tenantId: { type: 'varchar' as const, nullable: true },
  organizationId: { type: 'varchar' as const, nullable: true },
  projectId: { type: 'varchar' as const },
  createdAt: { type: 'datetime' as const }
}
const schemas = [
  new EntitySchema<CodingDelivery>({
    name: 'CodingDelivery',
    target: CodingDelivery,
    columns: {
      ...columns,
      createdById: { type: 'varchar' },
      revision: { type: 'int' },
      requirement: { type: 'simple-json' },
      instanceId: { type: 'varchar', nullable: true }
    }
  }),
  new EntitySchema<CodingDeliveryWork>({
    name: 'CodingDeliveryWork',
    target: CodingDeliveryWork,
    columns: {
      ...columns,
      deliveryId: { type: 'varchar' },
      requirementVersion: { type: 'int' },
      requirement: { type: 'simple-json' },
      phase: { type: 'varchar' },
      context: { type: 'simple-json' },
      evidence: { type: 'simple-json', nullable: true }
    }
  })
]
export async function deliveryFixture(deployment: 'cli' | 'current-instance' = 'cli', github = false) {
  const db = await new DataSource({ type: 'sqljs', entities: schemas, synchronize: true }).initialize()
  const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
  const projectId = randomUUID(),
    id = randomUUID(),
    instanceId = randomUUID()
  const requirement = releaseRequirementSchema.parse({
    title: 'Example plugin',
    requirement: 'Return a greeting',
    target: {
      key: 'test',
      title: 'Test',
      baseUrl: 'http://target.test/api',
      projectIds: [projectId],
      environment: 'acceptance',
      deployment,
      credentialReference: 'secret-store:test'
    },
    repository: {
      key: 'repo',
      remoteUrl: github ? 'https://github.com/example/plugins.git' : 'https://git.test/org/project',
      projectIds: [projectId],
      baseBranch: 'main',
      mode: github ? 'pull_request' : 'commit',
      ...(github ? { delivery: 'github', connectorBindingId: randomUUID() } : {})
    }
  })
  let config = configSchema.parse({ targets: [requirement.target], repositories: [requirement.repository] })
  const capabilities = new DefaultRuntimeCapabilityRegistry()
  let defaultMode: DeliveryMode = 'release'
  capabilities.register(
    ProjectConfigurationRuntimeCapability,
    Object.assign({} as ProjectConfigurationApi, {
      getRuntimeConfiguration: async () => ({
        projectType: TYPE,
        revision: 0,
        effectiveValues: { deliveryMode: defaultMode }
      })
    })
  )
  const access = { projectId, role: 'owner' as const, canManage: true, archived: false, ...TYPE }
  capabilities.register(ProjectAccessRuntimeCapability, {
    assertEdit: async ({ actor: a, projectId: p }) => {
      if (a.tenantId !== actor.tenantId || a.organizationId !== actor.organizationId || p !== projectId)
        throw Error('denied')
      return access
    },
    assertManage: async () => access,
    assertAssistant: async () => access,
    listReadable: async () => [access]
  })
  const row = db.getRepository(CodingDelivery).create({
    ...actor,
    id,
    projectId,
    createdById: actor.userId,
    revision: 1,
    requirement,
    instanceId,
    createdAt: new Date()
  })
  await db.getRepository(CodingDelivery).save(row)
  const store = new CodingDeliveryStore(
    db.getRepository(CodingDelivery),
    db.getRepository(CodingDeliveryWork),
    capabilities,
    async () => config
  )
  const context: ProjectPipelineAssistantContext = {
    actor,
    projectId,
    work: {
      instanceId,
      runId: randomUUID(),
      roundId: randomUUID(),
      nodeInstanceId: randomUUID(),
      operationId: randomUUID(),
      inputDigest: 'a'.repeat(64),
      generation: 1
    },
    idempotencyKey: randomUUID(),
    inputs: {},
    parameters: {},
    subjects: [store.version(row)],
    executor: {
      xpertId: randomUUID(),
      workspaceId: randomUUID(),
      publishedVersion: '1',
      executionId: randomUUID(),
      conversationId: randomUUID()
    }
  }
  let currentContext = context
  let active = true
  let completed = false
  const graph = () =>
    Object.assign({} as ProjectPipelineGraph, {
      projectId,
      instance: { id: instanceId, revision: 1 },
      runId: context.work.runId,
      runState: active ? 'active' : 'cancelled',
      roundId: currentContext.work.roundId,
      round: { generation: currentContext.work.generation, inputDigest: currentContext.work.inputDigest },
      nodes: [
        {
          id: currentContext.work.nodeInstanceId,
          projection: { state: { freshness: 'current', lifecycle: completed ? 'completed' : 'active' } }
        }
      ]
    })
  capabilities.register(ProjectPipelinesRuntimeCapability, {
    graph: async () => graph(),
    list: async () => ({ items: [], next: null }),
    rounds: async () => ({ items: [], next: null }),
    refresh: async () => ({ status: 'queued' }),
    synchronize: async () => null
  })
  const nextRound = jest.fn(async () => ({ instanceId, runId: context.work.runId, roundId: randomUUID(), revision: 2 }))
  capabilities.register(ProjectPipelineCommandsRuntimeCapability, {
    nextRound,
    configure: jest.fn(),
    start: jest.fn(),
    decide: jest.fn(),
    cancel: jest.fn(),
    retry: jest.fn()
  })
  const artifacts = new Map<string, Awaited<ReturnType<ArtifactsApi['readArtifactVersion']>>>()
  const artifactApi = Object.assign({} as ArtifactsApi, {
    readArtifactVersion: jest.fn(async (input: { artifactId: string; artifactVersionId: string }) => {
      const value = artifacts.get(input.artifactId)
      if (!value || value.version.id !== input.artifactVersionId) throw Error('missing artifact')
      return value
    })
  })
  capabilities.register(ArtifactsRuntimeCapability, artifactApi)
  let accepted: ProjectTaskAcceptanceReceipt
  const readAcceptance = jest.fn<Promise<ProjectTaskAcceptanceReceipt | null>, [ProjectTaskContext, string]>(
    async () => accepted
  )
  const unusedTaskApi = async () => {
    throw new Error('Unexpected task API call in delivery fixture')
  }
  capabilities.register(ProjectTasksRuntimeCapability, {
    readAcceptance,
    graph: unusedTaskApi,
    refresh: unusedTaskApi,
    change: unusedTaskApi,
    resolveExecution: unusedTaskApi
  })
  const evidence = new CodingEvidenceService(store),
    operations = new CodingOperations(store, evidence)
  const policy = new CodingReleasePolicy(store, evidence)

  function addFile(fileName: string, content: string) {
    const artifactId = randomUUID(),
      versionId = randomUUID(),
      buffer = Buffer.from(content)
    const sha256 = createHash('sha256').update(buffer).digest('hex')
    artifacts.set(artifactId, {
      artifact: {
        id: artifactId,
        ...actor,
        projectId,
        pluginName: 'fixture',
        resourceType: 'task',
        resourceId: 'fixture',
        kind: 'file',
        status: 'active'
      },
      version: {
        id: versionId,
        artifactId,
        versionNumber: 1,
        status: 'active',
        mimeType: 'application/octet-stream',
        sha256
      },
      fileName,
      mimeType: 'application/octet-stream',
      buffer
    })
    return { artifactId, versionId, fileName, sha256 }
  }
  function task(files: ReturnType<typeof addFile>[], c = currentContext) {
    const taskId = randomUUID(),
      reviewExecutionId = randomUUID()
    accepted = {
      projectId,
      taskId,
      taskRevision: 4,
      conversationId: c.executor.conversationId,
      decisionId: randomUUID(),
      review: { executionId: reviewExecutionId, mode: 'execution', verdict: 'pass' },
      artifacts: files.map(({ artifactId, versionId }) => ({ artifactId, versionId }))
    }
    return accepted
  }
  const packageFile = addFile('plugin.tgz', 'fixture package bytes'),
    sourceFile = addFile('source.bundle', 'fixture source bytes'),
    reportFile = addFile('report.json', '{"fixture":true}')
  const manifest = {
    version: 1 as const,
    phase: 'development' as const,
    work: context.work,
    commit: 'a'.repeat(40),
    packageName: '@fixture/plugin',
    packageVersion: '0.1.0',
    sourceFormat: 'git-bundle' as const,
    source: { fileName: sourceFile.fileName, sha256: sourceFile.sha256 },
    package: { fileName: packageFile.fileName, sha256: packageFile.sha256 },
    acceptance: { type: 'mcp' as const, componentKey: 'fixture-tools' },
    report: { fileName: reportFile.fileName, sha256: reportFile.sha256 },
    releaseNotes: 'Fixture',
    changes: ['Fixture'],
    restartRequired: false
  }
  const manifestFile = addFile('delivery-manifest.json', JSON.stringify(manifest))
  task([manifestFile, packageFile, sourceFile, reportFile])
  async function next(phase: Phase, candidate: ProjectPipelineEvidenceRef, deployment?: ProjectPipelineEvidenceRef) {
    currentContext = {
      ...context,
      work: { ...context.work, nodeInstanceId: randomUUID(), operationId: randomUUID() },
      executor: { ...context.executor, conversationId: randomUUID(), executionId: randomUUID() },
      inputs: {
        candidate: { kind: 'evidence', value: candidate },
        approval: {
          kind: 'evidence',
          value: {
            resolverRef: 'platform.pipeline-decision@1',
            objectKey: randomUUID(),
            version: '1',
            digest: 'b'.repeat(64),
            schemaRef: 'platform.human-decision@1'
          }
        },
        ...(deployment ? { deployment: { kind: 'evidence' as const, value: deployment } } : {})
      }
    }
    capabilities.register(ProjectPipelineEvidenceRuntimeCapability, {
      read: async () => ({
        kind: 'human',
        policyRef: refs.approval,
        outcome: 'approve',
        actorId: actor.userId,
        roundId: context.work.roundId,
        inputDigest: context.work.inputDigest,
        generation: 1
      })
    })
    await operations.prepare(currentContext, phase)
    return currentContext
  }
  return {
    db,
    actor,
    projectId,
    id,
    row,
    requirement,
    context,
    store,
    evidence,
    operations,
    policy,
    capabilities,
    access,
    artifacts,
    artifactApi,
    addFile,
    task,
    manifest,
    manifestFile,
    packageFile,
    sourceFile,
    reportFile,
    readAcceptance,
    setDefaultMode: (value: DeliveryMode) => {
      defaultMode = value
    },
    accepted: () => accepted,
    next,
    nextRound,
    setActive: (value: boolean) => {
      active = value
    },
    setCompleted: () => {
      completed = true
    },
    changeTarget: () => {
      config.targets[0] = { ...config.targets[0], allowRestart: true }
    },
    revoke: () => {
      config = { ...config, targets: [] }
    }
  }
}
