import { Injectable } from '@nestjs/common'
import {
  projectPluginDeploymentRequestSchema,
  projectPluginDeploymentRefs,
  type ProjectPipelineEvidenceRef
} from '@xpert-ai/contracts'
import { ProjectPipelineRuntimeAdapterProvider, type ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { CodingDeliveryStore, conflict } from './store'
import { type DeliveryEvidence } from './schemas'
import { canonical, digest, refs } from './constants'

export function deploymentRequest(candidate: DeliveryEvidence) {
  if (
    candidate.manifest.phase !== 'development' ||
    !('target' in candidate.releaseScope) ||
    candidate.releaseScope.target.deployment !== 'current-instance'
  )
    throw conflict('CODING_HOST_DEPLOYMENT_NOT_ALLOWED')
  const manifest = candidate.manifest
  const file = candidate.artifacts.find(
    (item) => item.fileName === manifest.package.fileName && item.sha256 === manifest.package.sha256
  )
  if (!file) throw conflict('CODING_FILE_NOT_IN_ACCEPTED_ARTIFACTS')
  return projectPluginDeploymentRequestSchema.parse({
    target: 'current-instance',
    artifactId: file.artifactId,
    artifactVersionId: file.versionId,
    sha256: file.sha256,
    fileName: file.fileName,
    packageName: manifest.packageName,
    packageVersion: manifest.packageVersion,
    allowReplace: candidate.releaseScope.target.allowReplaceTestPlugins,
    allowRestart: candidate.releaseScope.target.allowRestart
  })
}
export function deploymentRequestRef(candidate: DeliveryEvidence): ProjectPipelineEvidenceRef {
  return {
    resolverRef: refs.deploymentRequest,
    schemaRef: projectPluginDeploymentRefs.request,
    objectKey: candidate.work.operationId,
    producerOperationId: candidate.work.operationId,
    version: '1',
    digest: digest(deploymentRequest(candidate))
  }
}
@Injectable()
@ProjectPipelineRuntimeAdapterProvider('evidence', refs.deploymentRequest)
export class CodingDeploymentRequestResolver {
  readonly kind = 'evidence'
  readonly ref = refs.deploymentRequest
  constructor(private readonly store: CodingDeliveryStore) {}
  async read(c: ProjectPipelineContext, reference: ProjectPipelineEvidenceRef) {
    const row = await this.store.operation(c, reference.objectKey)
    if (!row.evidence || canonical(reference) !== canonical(deploymentRequestRef(row.evidence)))
      throw conflict('CODING_EVIDENCE_IDENTITY_MISMATCH')
    return deploymentRequest(row.evidence)
  }
}
