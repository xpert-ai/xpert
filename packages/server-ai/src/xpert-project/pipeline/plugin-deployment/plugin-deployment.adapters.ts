import { Injectable } from '@nestjs/common'
import {
  projectPluginDeploymentRefs, projectPluginDeploymentRequestSchema, projectPluginDeploymentReceiptSchema,
  type ProjectPipelineEvidenceRef, type ProjectPipelineExtensionDescriptor
} from '@xpert-ai/contracts'
import { ProjectPipelineContributor, ProjectPipelineRuntimeAdapterProvider, type ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { ProjectPluginDeploymentStore, deploymentConflict } from './plugin-deployment.store'

@Injectable()
@ProjectPipelineContributor('platform.plugin-deployment')
export class ProjectPluginDeploymentContribution {
  readonly key = 'platform.plugin-deployment'
  readonly configurations = []
  readonly descriptors: ProjectPipelineExtensionDescriptor[] = [
    { kind: 'schema', ref: projectPluginDeploymentRefs.request },
    { kind: 'schema', ref: projectPluginDeploymentRefs.receipt },
    { kind: 'operation', ref: projectPluginDeploymentRefs.operation, effects: 'external_write',
      idempotency: 'keyed_receipt', retry: 'after_confirmed_failure', requiredCapabilities: [],
      inputs: { request: { schemaRef: projectPluginDeploymentRefs.request, cardinality: 'one' },
        approval: { schemaRef: 'platform.human-decision@1', cardinality: 'one' } },
      outputs: { deployment: projectPluginDeploymentRefs.receipt } }
  ]
}

@Injectable()
@ProjectPipelineRuntimeAdapterProvider('schema', projectPluginDeploymentRefs.request)
export class ProjectPluginDeploymentRequestSchema {
  readonly kind = 'schema' as const
  readonly ref = projectPluginDeploymentRefs.request
  parse(value: unknown) { return projectPluginDeploymentRequestSchema.parse(value) }
}

@Injectable()
@ProjectPipelineRuntimeAdapterProvider('schema', projectPluginDeploymentRefs.receipt)
export class ProjectPluginDeploymentReceiptSchema {
  readonly kind = 'schema' as const
  readonly ref = projectPluginDeploymentRefs.receipt
  parse(value: unknown) { return projectPluginDeploymentReceiptSchema.parse(value) }
}

@Injectable()
@ProjectPipelineRuntimeAdapterProvider('evidence', projectPluginDeploymentRefs.evidence)
export class ProjectPluginDeploymentEvidence {
  readonly kind = 'evidence' as const
  readonly ref = projectPluginDeploymentRefs.evidence
  constructor(private readonly store: ProjectPluginDeploymentStore, private readonly access: ProjectAccessRuntimeService) {}
  async read(c: ProjectPipelineContext, reference: ProjectPipelineEvidenceRef) {
    if (!(await this.access.listReadable({ actor: c.actor, projectIds: [c.projectId] })).length) throw deploymentConflict()
    return this.store.read(c, reference)
  }
}

export const ProjectPluginDeploymentAdapters = [ProjectPluginDeploymentContribution, ProjectPluginDeploymentRequestSchema,
  ProjectPluginDeploymentReceiptSchema, ProjectPluginDeploymentEvidence]
