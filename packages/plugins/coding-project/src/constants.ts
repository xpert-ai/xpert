import { createHash } from 'node:crypto'
import type { ProjectPipelineJsonValue } from '@xpert-ai/contracts'
export const PLUGIN_NAME = '@xpert-ai/plugin-coding-project'
export const NAMESPACE = 'coding_project'
export const PROVIDER = 'coding-project-delivery'
export const FEATURE = 'coding_project.delivery'
export const TYPE = { applicationKey: `${PLUGIN_NAME}:coding`, projectTypeKey: 'coding' }
export const deliveryBranch = (id: string, revision: number) => `coding-delivery/${id}/v${revision}`
export const refs = {
  subject: 'coding_project.requirement@1', subjectSchema: 'coding_project.requirement-schema@1',
  evidence: 'coding_project.evidence@1', evidenceSchema: 'coding_project.delivery-evidence@1',
  deploymentRequest: 'coding_project.deployment-request@1', currentDevelopment: 'coding_project.development@2', currentDeployment: 'coding_project.deployment@2',
  development: 'coding_project.development@1', deployment: 'coding_project.deployment@1',
  git: 'coding_project.git@1', rework: 'coding_project.rework@1', approval: 'coding_project.release-approval@1'
}
export const label = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
export function canonical(value: ProjectPipelineJsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}
export const digest = (value: ProjectPipelineJsonValue) => createHash('sha256').update(canonical(value)).digest('hex')
export function identity(...parts: string[]) {
  const hash = createHash('sha256').update(JSON.stringify(parts)).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}
