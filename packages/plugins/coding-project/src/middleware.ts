import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import {
  AgentMiddlewareStrategy,
  ConnectorRuntimeCapability,
  type IAgentMiddlewareStrategy,
  type IAgentMiddlewareContext,
  type AgentMiddleware,
  type ProjectPipelineContext
} from '@xpert-ai/plugin-sdk'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { CodingDeliveryStore, conflict } from './store'
import { CodingDeliveryService } from './delivery.service'
import { CodingEvidenceService } from './evidence'
import { CodingDeploymentService } from './deployment'
import { CodingGitService } from './git'
import { deliveryModeSchema } from './schemas'
import { PROVIDER, FEATURE, label } from './constants'

const operation = z.object({ operationId: z.string().uuid() }).strict()
export const TOOL_NAMES = [
  'coding_delivery_targets',
  'coding_delivery_start',
  'coding_delivery_context',
  'coding_delivery_submit',
  'coding_delivery_materialize',
  'coding_delivery_test_access',
  'coding_delivery_git',
  'coding_delivery_rework'
] as const

@Injectable()
@AgentMiddlewareStrategy(PROVIDER)
export class CodingDeliveryMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  constructor(
    private readonly service: CodingDeliveryService,
    private readonly store: CodingDeliveryStore,
    private readonly evidence: CodingEvidenceService,
    private readonly deployment: CodingDeploymentService,
    private readonly git: CodingGitService
  ) {}
  getToolNames() {
    return TOOL_NAMES
  }
  readonly meta: TAgentMiddlewareMeta = {
    name: PROVIDER,
    label: label('Coding Project delivery', '编码项目交付'),
    features: [FEATURE],
    description: label(
      'Governed software delivery through Project Pipelines and independent acceptance.',
      '通过项目流水线与独立验收交付软件。'
    ),
    configSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
    const scope = (): ProjectPipelineContext => {
      if (!context.projectId || !context.conversationId || !context.xpertId)
        throw conflict('CODING_PROJECT_CONVERSATION_REQUIRED')
      return {
        projectId: context.projectId,
        actor: { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId }
      }
    }
    return {
      name: PROVIDER,
      tools: [
        tool(async (input) => JSON.stringify(await this.service.preflight(scope(), context.xpertId!, input)), {
          name: 'coding_delivery_targets',
          schema: z
            .object({
              mode: deliveryModeSchema.optional(),
              targetKey: z.string().optional(),
              repositoryKey: z.string().optional()
            })
            .strict(),
          verboseParsingErrors: true,
          description:
            'Preflight the selected workflow before planning. Omit mode to read the Project default. local needs no external target or repository; empty lists are normal. release lists only authorized destinations and reports configuration blockers. For CODING_DESTINATION_SELECTION_REQUIRED, select targetKey/repositoryKey from the returned choices using the authorized request and preflight again; this is not missing administrator setup. ready covers workflow configuration, not CLI authentication or environment readiness. Credential references are handles, never secret values.',
          metadata: { toolName: label('Read delivery scope', '读取交付范围') }
        }),
        tool(
          async (input) =>
            JSON.stringify(await this.service.start(scope(), context.conversationId!, context.xpertId!, input)),
          {
            name: 'coding_delivery_start',
            schema: z
              .object({
                title: z.string().min(1).max(240),
                requirement: z.string().min(1).max(16000),
                mode: deliveryModeSchema.optional(),
                targetKey: z.string().optional(),
                repositoryKey: z.string().optional(),
                acceptedTaskId: z.string().uuid().optional()
              })
              .strict(),
            verboseParsingErrors: true,
            description:
              'Start one native Pipeline and hand off to its separate stage conversation. Follow nextAction: finish_coordination_turn means report the identifiers and end, without creating tasks or adopting the stage here; continue_stage means this is already the assigned stage. mode=local develops, installs and independently accepts only inside the cloud Computer, then delivers local artifacts without approval, host installation or Git push. mode=release runs the full human-approved external deployment and Git delivery workflow and requires authorized target/repository configuration. Omitted mode uses the Project default; existing deliveries keep their pinned mode. Do not select release for a request limited to local acceptance. A no-push constraint alone does not mean local: if external deployment is requested without Git delivery, clarify that scope before starting the full release workflow. To release an already accepted deliverable, pass acceptedTaskId: the host pins its formal independent acceptance and the first stage only prepares missing delivery metadata/exports, preserving the existing package and tests. Do not redevelop or repack it. A single authorized target/repository is selected automatically. A manager may initialize the binding; an Assistant principal needs an existing binding. Same conversation/title reuses the delivery. Human release approval remains a separate UI gate.',
            metadata: { toolName: label('Start software delivery', '启动软件交付') }
          }
        ),
        tool(async (input) => JSON.stringify(await this.service.context(scope(), input.operationId)), {
          name: 'coding_delivery_context',
          schema: operation,
          verboseParsingErrors: true,
          description:
            'Read the exact operation supplied in the stage prompt: requirement, pinned candidate, manifest JSON Schema and Pipeline state. These are authoritative technical identities; infer business acceptance through independent review.',
          metadata: { toolName: label('Inspect delivery stage', '查看交付阶段') }
        }),
        tool(
          async (input) =>
            JSON.stringify(
              await this.evidence.submit(
                scope(),
                context.conversationId!,
                input.operationId,
                input.taskId,
                input.manifestArtifactId
              )
            ),
          {
            name: 'coding_delivery_submit',
            schema: operation.extend({ taskId: z.string().uuid(), manifestArtifactId: z.string().uuid() }).strict(),
            verboseParsingErrors: true,
            description:
              'Seal output from a formally accepted task in this stage conversation. Requires separate execution review and project_decide_task accept. Pass the delivery-manifest.json Artifact ID returned by project_get_task; host derives its version and verifies referenced artifacts and exact approved candidate. Does not approve a release.',
            metadata: { toolName: label('Submit accepted delivery', '提交已验收成果') }
          }
        ),
        tool(async (input) => JSON.stringify(await this.service.materialize(scope(), input.operationId)), {
          name: 'coding_delivery_materialize',
          schema: operation,
          verboseParsingErrors: true,
          description:
            'Copy the immutable approved candidate into a deterministic Project folder for the cloud CLI. Existing identical bytes are reused; conflicting files are preserved and reported. No package rebuild or deployment occurs.',
          metadata: { toolName: label('Restore approved artifacts', '还原已批准交付物') }
        }),
        tool(
          async (input) =>
            JSON.stringify(
              await this.deployment.execute(scope(), context.conversationId!, input.operationId, input.action)
            ),
          {
            name: 'coding_delivery_test_access',
            schema: operation.extend({ action: z.enum(['inspect', 'prepare_tests']) }).strict(),
            verboseParsingErrors: true,
            description:
              'Read the completed host installation receipt or prepare bounded MCP test access for the exact accepted candidate. Cannot install or replace plugins. prepare_tests writes a two-hour publication-scoped credential to a Project file and returns only its path; never print or export its contents. Only the assigned acceptance stage can call it. Delegate business tests and independent review to the cloud CLI.',
            metadata: { toolName: label('Deploy approved package', '部署已批准插件包') }
          }
        ),
        tool(
          async (input) =>
            JSON.stringify(
              await this.git.execute(
                scope(),
                context.conversationId!,
                input.operationId,
                input.action,
                context.runtime?.capabilities?.get(ConnectorRuntimeCapability)
              )
            ),
          {
            name: 'coding_delivery_git',
            schema: operation.extend({ action: z.enum(['inspect', 'deliver']) }).strict(),
            verboseParsingErrors: true,
            description:
              'For repository.delivery=github, inspect or deliver the exact approved source commit through a fixed host program. Requires accepted target deployment and a GitHub Connector authorized in this Assistant graph. GitHub credentials remain on the host. Creates only the approved new branch, never overwrites another commit, force-pushes or merges; creates or reuses its PR. Source must be an immutable Git bundle. Inspect/reconcile interrupted writes before retrying; delegate independent remote verification to the Coding CLI.',
            metadata: { toolName: label('Deliver approved Git commit', '交付已批准 Git 提交') }
          }
        ),
        tool(async (input) => JSON.stringify(await this.service.rework(scope(), input.operationId, input.feedback)), {
          name: 'coding_delivery_rework',
          schema: operation.extend({ feedback: z.string().min(1).max(8000) }).strict(),
          verboseParsingErrors: true,
          description:
            'Record concrete independent-review findings and start a new source Round when an approved candidate requires business changes. Prior work/approval remains historical. End this superseded stage after success. Use ordinary task recovery for transient infrastructure failures.',
          metadata: { toolName: label('Start delivery rework', '启动交付返工') }
        })
      ]
    }
  }
}
