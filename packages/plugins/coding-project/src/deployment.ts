import { Injectable } from '@nestjs/common'
import { projectPluginDeploymentReceiptSchema } from '@xpert-ai/contracts'
import {
  PluginTestAccessCapability,
  ProjectPipelineEvidenceRuntimeCapability,
  type ProjectPipelineContext
} from '@xpert-ai/plugin-sdk'
import { CodingDeliveryStore, conflict } from './store'
import { CodingEvidenceService } from './evidence'
import { deploymentRequest } from './deployment-request'
import { digest } from './constants'

/** The coordinator reads the host receipt and requests test access; it cannot install packages. */
@Injectable()
export class CodingDeploymentService {
  constructor(
    private readonly store: CodingDeliveryStore,
    private readonly evidence: CodingEvidenceService
  ) {}
  async execute(
    c: ProjectPipelineContext,
    conversationId: string,
    operationId: string,
    action: 'inspect' | 'prepare_tests'
  ) {
    const row = await this.store.operation(c, operationId)
    if (
      row.context.executor.conversationId !== conversationId ||
      (row.context.executor.userId ?? row.context.actor.userId) !== c.actor.userId
    )
      throw conflict('CODING_EXECUTOR_SCOPE_MISMATCH')
    await this.store.assertActive(row, 'submit', c)
    if (
      row.phase !== 'deployment' ||
      row.requirement.mode === 'local' ||
      row.requirement.target.deployment !== 'current-instance'
    )
      throw conflict('CODING_HOST_DEPLOYMENT_NOT_ALLOWED')
    const input = row.context.inputs.installation
    if (input?.kind !== 'evidence') throw conflict('CODING_DEPLOYMENT_IDENTITY_MISMATCH')
    const proof = projectPluginDeploymentReceiptSchema.parse(
      await this.store.capabilities.require(ProjectPipelineEvidenceRuntimeCapability).read(c, input.value)
    )
    const candidate = await this.evidence.input({ ...row.context, actor: c.actor }, 'candidate')
    if (digest(proof.request) !== digest(deploymentRequest(candidate)))
      throw conflict('CODING_DEPLOYMENT_IDENTITY_MISMATCH')
    if (action === 'inspect') return proof
    const manifest = candidate.manifest
    if (manifest.phase !== 'development' || !manifest.acceptance?.componentKey)
      throw conflict('CODING_HOST_DEPLOYMENT_NOT_ALLOWED')
    return this.store.capabilities.require(PluginTestAccessCapability).prepare(c, {
      deployment: input.value,
      componentKey: manifest.acceptance.componentKey
    })
  }
}
