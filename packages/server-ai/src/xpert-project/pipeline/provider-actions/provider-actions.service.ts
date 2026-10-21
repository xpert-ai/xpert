// Invariants: the host authorizes version-bound commands; providers authorize their domain effects.
// Discovery and diagnostics are read-only. Ambiguous dispatches recover the original receipt.
import { pipelineDispatchEnabled, assertPipelineDispatchEnabled } from '../runtime/pipeline-dispatch-policy'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { t } from 'i18next'
import { z } from 'zod/v3'
import {
    projectPipelineNodePresentationSchema,
    projectPipelineProviderActionDescriptorSchema,
    projectPipelineProviderActionReceiptSchema,
    parseProjectPipelineParameters,
    type ProjectPipelineProviderActionCommand,
    type ProjectPipelineProviderActionReceipt
} from '@xpert-ai/contracts'
import {
    ProjectPipelineProjectionProviderRegistry,
    ProjectPipelineProviderActionsRuntimeCapability,
    type ProjectPipelineContext,
    type ProjectPipelineProviderActionsApi
} from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProvider } from '../../../shared/runtime/runtime-capability-provider.decorator'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { boundedProjection } from '../../services/task-projection/project-task-projection.coordinator'
import { ProjectPipelineProjectionService } from '../projection/pipeline-projection.service'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { assertPipelineCommandAuthority, pipelineCommandCapability } from '../runtime/pipeline-command-authority'
import { ProjectPipelineProviderActionStore, providerActionContext, providerActionView } from './provider-action.store'
import { pipelineHostCapabilities } from '../configuration/pipeline-host-profile'

const descriptors = z
    .array(projectPipelineProviderActionDescriptorSchema)
    .max(100)
    .refine((items) => new Set(items.map((item) => item.ref)).size === items.length)

@Injectable()
@RuntimeCapabilityProvider(ProjectPipelineProviderActionsRuntimeCapability)
export class ProjectPipelineProviderActionsService implements ProjectPipelineProviderActionsApi {
    constructor(
        private readonly store: ProjectPipelineProviderActionStore,
        private readonly access: ProjectAccessRuntimeService,
        private readonly providers: ProjectPipelineProjectionProviderRegistry,
        private readonly projection: ProjectPipelineProjectionService
    ) {}

    async list(context: ProjectPipelineContext, input: { instanceId: string; nodeInstanceId: string }) {
        const [project] = await this.access.listReadable({ actor: context.actor, projectIds: [context.projectId] })
        if (!project) throw new ForbiddenException(t('server-ai:Error.ProjectTaskAccessDenied'))
        const saved = await this.store.target(context, input)
        const operations = (await this.store.list(context, input)).map(providerActionView)
        let items: z.output<typeof descriptors> = []
        const dispatchEnabled = pipelineDispatchEnabled()
        if (
            dispatchEnabled &&
            pipelineCommandCapability().allowed &&
            !project.archived &&
            ['owner', 'manager', 'editor'].includes(project.role) &&
            saved.round.state === 'active' &&
            saved.provider.node.state.freshness === 'current' &&
            saved.provider.node.state.applicability === 'selected'
        ) {
            const provider = this.providers.getForActor(saved.instance.ownerRef, context.actor)
            if (provider.actions && provider.executeAction && provider.inspectAction)
                items = descriptors
                    .parse(await boundedProjection(provider.actions(saved.provider)))
                    .filter((action) => saved.definition.actionRefs?.includes(action.ref))
        }
        return { target: saved.target, items, operations, dispatchEnabled }
    }

    async describe(context: ProjectPipelineContext, input: { instanceId: string; nodeInstanceId: string }) {
        const [project] = await this.access.listReadable({ actor: context.actor, projectIds: [context.projectId] })
        if (!project) throw new ForbiddenException(t('server-ai:Error.ProjectTaskAccessDenied'))
        const saved = await this.store.target(context, input)
        const provider = this.providers.getForActor(saved.instance.ownerRef, context.actor)
        const result = provider.describeNode ? await boundedProjection(provider.describeNode(saved.provider)) : null
        return result ? projectPipelineNodePresentationSchema.parse(result) : null
    }

    async submit(context: ProjectPipelineContext, input: ProjectPipelineProviderActionCommand) {
        assertPipelineCommandAuthority()
        await this.access.assertEdit({ actor: context.actor, projectId: context.projectId })
        const replay = await this.store.replay(context, input)
        if (replay) return providerActionView(replay)
        assertPipelineDispatchEnabled()
        const available = await this.list(context, {
            instanceId: input.instanceId,
            nodeInstanceId: input.nodeInstanceId
        })
        const action = available.items.find(
            (item) => item.ref === input.actionRef && item.sourceRevision === input.sourceRevision
        )
        if (!action) throw pipelineProjectionConflict('PROVIDER_ACTION_NOT_ALLOWED')
        try {
            parseProjectPipelineParameters(action.parameters, input.parameters)
        } catch {
            throw pipelineProjectionConflict('PROVIDER_ACTION_PARAMETERS_INVALID')
        }
        return providerActionView(await this.store.reserve(context, input))
    }

    async run(context: ProjectPipelineContext, operationId: string) {
        await this.access.assertEdit({ actor: context.actor, projectId: context.projectId })
        const worker = randomUUID(),
            claim = await this.store.claim(context, operationId, worker)
        if (!claim) return
        const { row, mode, fence } = claim
        if (mode === 'project') {
            await this.projection.synchronize(context, { providerRef: row.providerRef, sourceKey: row.sourceKey })
            await this.store.projected(context, row.id, worker, fence)
            return
        }
        let receipt: ProjectPipelineProviderActionReceipt = {
            status: 'unknown',
            reasonCode: 'PROVIDER_ACTION_OBSERVATION_UNAVAILABLE'
        }
        try {
            const provider = this.providers.getForActor(row.providerRef, context.actor)
            const saved = providerActionContext(context, row)
            if (mode === 'execute') {
                const available =
                    provider.actions && provider.executeAction && provider.inspectAction
                        ? descriptors.parse(await boundedProjection(provider.actions(saved)))
                        : []
                const action = available.find(
                    (item) => item.ref === saved.actionRef && item.sourceRevision === saved.sourceRevision
                )
                if (!action) receipt = { status: 'failed', reasonCode: 'PROVIDER_ACTION_NOT_ALLOWED' }
                else {
                    parseProjectPipelineParameters(action.parameters, saved.parameters)
                    await this.access.assertEdit({ actor: context.actor, projectId: context.projectId })
                    if (!(await this.store.begin(context, row.id, worker, fence))) return
                    receipt = projectPipelineProviderActionReceiptSchema.parse(
                        await boundedProjection(
                            provider.executeAction!({
                                ...saved,
                                hostCapabilities: pipelineHostCapabilities(),
                                nativeDispatch: {
                                    kind: 'provider_action',
                                    operationId: row.id,
                                    leaseOwner: worker,
                                    leaseFence: fence
                                }
                            }),
                            20_000
                        )
                    )
                }
            } else if (provider.inspectAction) {
                receipt = projectPipelineProviderActionReceiptSchema.parse(
                    await boundedProjection(provider.inspectAction(saved, row.receipt?.receiptKey), 20_000)
                )
            }
        } catch {
            /* An unavailable or invalid response cannot prove the effect failed. */
        }
        return this.store.settle(context, row.id, worker, fence, receipt)
    }
}
