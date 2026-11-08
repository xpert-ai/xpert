import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
    AgentMiddlewareStrategy,
    type AgentMiddleware,
    type IAgentMiddlewareContext,
    type IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { ResolveGroupResourceNavigationToolsCommand } from '../../chat-group/commands/resolve-group-resource-navigation-tools.command'
import { createProjectResourceNavigationTools } from '../../shared/agent/resource-navigation/project'
import { ContentCatalogService } from '../catalog/content-catalog.service'
import { ContentEditorsService } from '../content-editors.service'
import { RESOURCE_ASSISTANT_MIDDLEWARE } from '../resource-assistant.constants'

const optionsSchema = z.object({}).strict()

/** Optional navigation only. Resource content, authoring and analytics retain their own capabilities and ACLs. */
@Injectable()
@AgentMiddlewareStrategy(RESOURCE_ASSISTANT_MIDDLEWARE)
export class ResourceAssistantMiddleware implements IAgentMiddlewareStrategy {
    readonly meta: TAgentMiddlewareMeta = {
        name: RESOURCE_ASSISTANT_MIDDLEWARE,
        label: { en_US: 'Resource Assistant', zh_Hans: '资源助手' },
        description: {
            en_US: 'Find authorized resources and open them in Workbench. Does not read content, edit resources or query data.',
            zh_Hans: '查找有权访问的资源并在工作台打开；不读取正文、修改资源或查询数据。'
        },
        icon: {
            type: 'svg',
            value: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7V4h6l2 3h10v13H3Z"/><circle cx="12" cy="13" r="3"/><path d="m14 15 3 3"/></svg>'
        },
        configSchema: { type: 'object', properties: {}, additionalProperties: false }
    }

    constructor(
        private readonly catalog: ContentCatalogService,
        private readonly editors: ContentEditorsService,
        private readonly commands: CommandBus
    ) {}

    getToolNames(): readonly string[] {
        return ['resource_search', 'resource_open']
    }

    async createMiddleware(options: unknown, context: IAgentMiddlewareContext): Promise<AgentMiddleware> {
        optionsSchema.parse(options === undefined ? {} : options)
        const { tenantId, organizationId, conversationId, xpertId, projectId, threadId } = context
        if (!organizationId || !conversationId || !xpertId || !projectId)
            return { name: RESOURCE_ASSISTANT_MIDDLEWARE, tools: [] }
        const resolved = await this.commands.execute(
            new ResolveGroupResourceNavigationToolsCommand({
                tenantId,
                organizationId,
                conversationId,
                assistantId: xpertId,
                projectId,
                threadId
            })
        )
        return {
            name: RESOURCE_ASSISTANT_MIDDLEWARE,
            tools:
                resolved.scope === 'group'
                    ? resolved.tools
                    : createProjectResourceNavigationTools(context, this.catalog, this.editors)
        }
    }
}
