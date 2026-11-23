import { ConflictException, Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import {
    AiModelTypeEnum,
    PermissionsEnum,
    XpertTypeEnum,
    isOrganizationSharedXpertWorkspace,
    type ICopilot
} from '@xpert-ai/contracts'
import { RequestContext, type DataSourceActor } from '@xpert-ai/plugin-sdk'
import { BusinessAreaService } from '@xpert-ai/server-core'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { normalizeXpertAgentConfig } from '@xpert-ai/contracts'
import { XpertPublishCommand } from '../../xpert/commands/publish.command'
import { t } from 'i18next'
import { Repository } from 'typeorm'
import { ResolveDefaultModelQuery } from '../../copilot/queries/resolve-default-model.query'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertImportCommand } from '../../xpert/commands/import.command'
import { AssistantSharingService } from '../../xpert/sharing/sharing.service'
import { Xpert } from '../../xpert/xpert.entity'
import { XpertService } from '../../xpert/xpert.service'

const changed = () => new ConflictException(t('server-ai:Error.ApplicationModelBootstrapAccess'))
function reservedId(parts: string[]) {
    const bytes = createHash('sha256').update(JSON.stringify(parts)).digest().subarray(0, 16)
    bytes[6] = (bytes[6] & 15) | 80
    bytes[8] = (bytes[8] & 63) | 128
    const hex = bytes.toString('hex')
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}

@Injectable()
export class ApplicationModelReaderService {
    constructor(
        private readonly workspacesAccess: XpertWorkspaceAccessService,
        private readonly areas: BusinessAreaService,
        private readonly commands: CommandBus,
        private readonly queries: QueryBus,
        private readonly xperts: XpertService,
        private readonly sharing: AssistantSharingService,
        @InjectRepository(Xpert) private readonly repository: Repository<Xpert>
    ) {}

    async workspaces(actor: DataSourceActor, candidates: Array<{ id: string; label: string }>) {
        RequestContext.hasPermission(PermissionsEnum.BUSINESS_AREA_MANAGE, true)
        const eligible = await this.workspacesAccess.findAccessibleWorkspaces(undefined, { purpose: 'authoring' })
        const allowed = new Set(
            eligible
                .filter(
                    (w) =>
                        w.tenantId === actor.tenantId &&
                        w.organizationId === actor.organizationId &&
                        w.capabilities?.canManage &&
                        !w.isTenantShared &&
                        !isOrganizationSharedXpertWorkspace(w)
                )
                .map((w) => w.id)
        )
        return candidates.filter((w) => allowed.has(w.id))
    }

    async authorize(actor: DataSourceActor, workspaceId: string) {
        RequestContext.hasPermission(PermissionsEnum.BUSINESS_AREA_MANAGE, true)
        const { workspace, isTenantShared } = await this.workspacesAccess.assertCanManage(workspaceId)
        if (
            workspace.organizationId !== actor.organizationId ||
            workspace.tenantId !== actor.tenantId ||
            isTenantShared ||
            isOrganizationSharedXpertWorkspace(workspace)
        )
            throw changed()
    }

    scoped(actor: DataSourceActor, integrationId: string, workspaceId: string, users: string[]) {
        const ids = (resource: string) => {
            const scope = [actor.tenantId, actor.organizationId, integrationId, workspaceId, resource]
            return {
                xpertId: reservedId(['application-model-reader', ...scope]),
                businessAreaId: reservedId(['application-model-area', ...scope])
            }
        }
        let areaId: string | undefined
        let prepared: string | undefined
        return {
            area: async (modelKey: string, label: string) => {
                await this.authorize(actor, workspaceId)
                const id = ids(modelKey).businessAreaId
                const area = await this.areas.ensureApplicationArea(id, label.slice(0, 220) + ' · ' + id.slice(0, 8))
                if (area.parentId) throw changed()
                areaId = id
                return id
            },
            prepare: async (resource: string, label: string) => {
                await this.authorize(actor, workspaceId)
                if (!areaId) throw changed()
                const businessAreaId = areaId
                const { xpertId } = ids(resource)
                const name = 'model-reader-' + xpertId
                const where = {
                    id: xpertId,
                    tenantId: actor.tenantId,
                    organizationId: actor.organizationId,
                    workspaceId
                }
                let reader = await this.repository.findOneBy(where)
                if (reader && reader.name !== name) throw changed()
                if (!reader) {
                    const copilot: ICopilot = await this.queries.execute(
                        new ResolveDefaultModelQuery(actor.tenantId, actor.organizationId, 'primary', ['copilotModel'])
                    )
                    const model = copilot?.copilotModel?.model ?? copilot?.defaultModels?.primary?.model
                    if (!model || !copilot?.id) throw changed()
                    const key = 'Agent_ModelReader'
                    const title = t('server-ai:Error.ApplicationModelReaderTitle', { model: label })
                    await this.commands.execute(
                        new XpertImportCommand(
                            {
                                team: {
                                    name,
                                    title,
                                    type: XpertTypeEnum.Agent,
                                    workspaceId,
                                    version: '1',
                                    agent: { key },
                                    copilotModel: { copilotId: copilot.id, modelType: AiModelTypeEnum.LLM, model }
                                },
                                nodes: [
                                    {
                                        type: 'agent',
                                        key,
                                        position: { x: 0, y: 0 },
                                        entity: { key, name: 'reader', title }
                                    }
                                ],
                                connections: []
                            },
                            { newXpertId: xpertId, workspaceDataScope: 'user' }
                        )
                    )
                    reader = await this.repository.findOneByOrFail(where)
                }
                if (reader.name !== name || (reader.businessAreaId && reader.businessAreaId !== businessAreaId))
                    throw changed()
                if (!reader.publishAt) {
                    const draft = reader.draft
                    if (
                        !draft ||
                        draft.nodes.length !== 1 ||
                        draft.nodes[0].type !== 'agent' ||
                        draft.nodes[0].key !== 'Agent_ModelReader' ||
                        draft.connections.length ||
                        (draft.team?.agentConfig &&
                            !isDeepStrictEqual(draft.team.agentConfig, normalizeXpertAgentConfig())) ||
                        draft.team?.commandProfile ||
                        draft.team?.features
                    )
                        throw changed()
                    await this.xperts.publish(xpertId, false, undefined, label, undefined, businessAreaId)
                } else if (reader.options?.pendingPublication && reader.version === '1') {
                    await this.commands.execute(
                        new XpertPublishCommand(xpertId, false, undefined, '', undefined, undefined, true, '1')
                    )
                }
                prepared = resource
                return { xpertId, businessAreaId }
            },
            grant: async (resource: string, xpertId: string) => {
                if (resource !== prepared || xpertId !== ids(resource).xpertId) throw changed()
                await this.authorize(actor, workspaceId)
                const reader = await this.repository.findOneBy({
                    id: xpertId,
                    tenantId: actor.tenantId,
                    organizationId: actor.organizationId,
                    workspaceId
                })
                if (
                    !reader?.publishAt ||
                    reader.businessAreaId !== areaId ||
                    reader.version !== '1' ||
                    reader.draft ||
                    reader.graph?.nodes.length !== 1 ||
                    reader.graph.nodes[0].type !== 'agent' ||
                    reader.graph.nodes[0].key !== 'Agent_ModelReader' ||
                    reader.graph.connections.length ||
                    reader.options?.pendingPublication ||
                    reader.commandProfile ||
                    (reader.agentConfig && !isDeepStrictEqual(reader.agentConfig, normalizeXpertAgentConfig()))
                )
                    throw changed()
                await this.sharing.grantUsers(xpertId, users)
            }
        }
    }
}
