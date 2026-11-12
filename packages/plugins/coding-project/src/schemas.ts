import { z } from 'zod/v3'
import { projectPipelineWorkContextSchema, projectPipelineSubjectVersionSchema,
  projectPipelineOperationInputSchema } from '@xpert-ai/contracts'

export const storedContextSchema = z.object({
  actor: z.object({ tenantId: z.string().uuid(), organizationId: z.string().uuid().nullable().optional(), userId: z.string().uuid() }),
  projectId: z.string().uuid(), work: projectPipelineWorkContextSchema, idempotencyKey: z.string(),
  subjects: z.array(projectPipelineSubjectVersionSchema).length(1),
  inputs: z.record(projectPipelineOperationInputSchema), parameters: z.object({}).strict(),
  executor: z.object({ userId: z.string().uuid().optional(), xpertId: z.string().uuid(), workspaceId: z.string().uuid(),
    publishedVersion: z.string(), executionId: z.string().uuid(), conversationId: z.string().uuid() })
}).strict()

export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const commit = z.string().regex(/^[a-f0-9]{40}([a-f0-9]{24})?$/)
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/)
const safeUrl = z.string().url().refine((value) => {
  const url = new URL(value)
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
}, 'Use a credential-free HTTP(S) URL without query or fragment')
export const targetSchema = z.object({
  key, title: z.string().min(1).max(160), baseUrl: safeUrl,
  projectIds: z.array(z.string().uuid()).max(200),
  environment: z.enum(['development', 'acceptance']),
  deployment: z.enum(['cli', 'current-instance']).default('cli'),
  computerBaseUrl: safeUrl.optional(),
  credentialReference: z.string().min(1).max(500),
  instructions: z.string().max(8000).default(''),
  allowRestart: z.boolean().default(false), allowReplaceTestPlugins: z.boolean().default(false)
}).strict()
export const repositorySchema = z.object({
  key, remoteUrl: safeUrl, projectIds: z.array(z.string().uuid()).max(200),
  baseBranch: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,150}$/),
  mode: z.enum(['commit', 'pull_request']), credentialReference: z.string().max(500).default(''),
  delivery: z.enum(['cli', 'github']).optional(), connectorBindingId: z.string().uuid().optional()
}).strict().superRefine((repository, ctx) => {
  if (repository.delivery === 'github' && !repository.connectorBindingId)
    ctx.addIssue({ code: 'custom', path: ['connectorBindingId'], message: 'A host-authorized GitHub Connector binding is required' })
})
export const configSchema = z.object({
  targets: z.array(targetSchema).max(100).default([]),
  repositories: z.array(repositorySchema).max(100).default([])
}).strict().superRefine((config, ctx) => {
  for (const field of ['targets', 'repositories'] as const)
    if (new Set(config[field].map((item) => item.key)).size !== config[field].length)
      ctx.addIssue({ code: 'custom', path: [field], message: 'Duplicate configuration key' })
})
export type CodingConfig = z.output<typeof configSchema>
export const CONFIG_READER = 'coding_project.config_reader'
export type ConfigReader = () => Promise<CodingConfig>

const fileSchema = z.object({ fileName: z.string().min(1).max(240).regex(/^[^/\\\u0000]+$/)
  .refine((name) => name !== '.' && name !== '..'), sha256: hashSchema }).strict()
export const artifactRefSchema = z.object({ artifactId: z.string().uuid(), versionId: z.string().uuid(),
  sha256: hashSchema, fileName: fileSchema.shape.fileName, size: z.number().int().nonnegative() }).strict()
const manifestBase = { version: z.literal(1), work: projectPipelineWorkContextSchema }
export const developmentManifestSchema = z.object({
  ...manifestBase, phase: z.literal('development'),
  commit, packageName: z.string().min(1).max(240), packageVersion: z.string().min(1).max(80),
  sourceFormat: z.enum(['git-bundle', 'archive']).optional(),
  source: fileSchema, package: fileSchema, report: fileSchema,
  releaseNotes: z.string().min(1).max(8000), changes: z.array(z.string().min(1).max(1000)).min(1).max(100),
  restartRequired: z.boolean(),
  acceptance: z.object({ type: z.literal('mcp'), componentKey: z.string().min(1).max(191) }).strict().optional()
}).strict()
export const deploymentManifestSchema = z.object({
  ...manifestBase, phase: z.literal('deployment'), candidateDigest: hashSchema,
  targetKey: key, baseUrl: safeUrl, installedPackageSha256: hashSchema,
  installedVersion: z.string().min(1).max(80), loadedVersion: z.string().min(1).max(80),
  report: fileSchema, installationReceipt: fileSchema
}).strict()
export const gitManifestSchema = z.object({
  ...manifestBase, phase: z.literal('git'), candidateDigest: hashSchema, commit,
  repositoryKey: key, remoteUrl: safeUrl, branch: z.string().min(1).max(160),
  mode: z.enum(['commit', 'pull_request']), pullRequestUrl: safeUrl.optional(),
  report: fileSchema, source: fileSchema
}).strict().superRefine((value, ctx) => {
  if (value.mode === 'pull_request' && !value.pullRequestUrl)
    ctx.addIssue({ code: 'custom', path: ['pullRequestUrl'], message: 'PR URL required' })
})
export const manifestSchema = z.union([developmentManifestSchema, deploymentManifestSchema, gitManifestSchema])
export type DeliveryManifest = z.output<typeof manifestSchema>
export type Phase = DeliveryManifest['phase']
export const requirementSchema = z.object({
  title: z.string().min(1).max(240), requirement: z.string().min(1).max(16000),
  origin: z.object({ type: z.literal('accepted_task'), taskId: z.string().uuid(), taskRevision: z.number().int().positive(),
    decisionId: z.string().uuid(), reviewExecutionId: z.string().uuid() }).strict().optional(),
  target: targetSchema, repository: repositorySchema, feedback: z.string().max(8000).default('')
}).strict()
export type Requirement = z.output<typeof requirementSchema>
export const evidenceSchema = z.object({
  version: z.literal(1), deliveryId: z.string().uuid(), requirementVersion: z.number().int().positive(),
  phase: z.enum(['development', 'deployment', 'git']), work: projectPipelineWorkContextSchema,
  taskId: z.string().uuid(), taskRevision: z.number().int().positive(),
  decisionId: z.string().uuid(), reviewExecutionId: z.string().uuid(),
  releaseScope: z.object({ target: targetSchema, repository: repositorySchema, branch: z.string() }).strict(),
  manifest: manifestSchema, artifacts: z.array(artifactRefSchema).min(1).max(16)
}).strict()
export type DeliveryEvidence = z.output<typeof evidenceSchema>
