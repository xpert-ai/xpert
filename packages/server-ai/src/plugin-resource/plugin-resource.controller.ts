import { PLUGIN_COMPONENT_TYPE, PluginComponentType, PluginResourceComponentSelector } from '@xpert-ai/contracts'
import { TransformInterceptor } from '@xpert-ai/server-core'
import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { PluginResourceInstallComponent, PluginResourceInstallerService } from './plugin-resource-installer.service'
import { ListPluginResourceComponentStatesQuery } from './queries'

@ApiTags('PluginResources')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller('plugin/:name/resources')
export class PluginResourceController {
    constructor(
        private readonly installer: PluginResourceInstallerService,
        private readonly queryBus: QueryBus
    ) {}

    @Get('state')
    async getState(@Param('name') name: string, @Query() query: unknown) {
        return {
            items: await this.queryBus.execute(
                new ListPluginResourceComponentStatesQuery(name, parseComponentStateQuery(query))
            )
        }
    }

    @Post('install-workspace')
    async installWorkspace(@Param('name') name: string, @Body() body: unknown) {
        const input = parseWorkspaceInstallInput(body)
        return this.installer.installToWorkspace(name, input.workspaceId, input.components)
    }

    @Post('install-xpert')
    async installXpert(@Param('name') name: string, @Body() body: unknown) {
        const input = parseXpertInstallInput(body)
        return this.installer.installToXpert(name, input.xpertId, input.components, input.agentKey)
    }
}

function parseComponentStateQuery(value: unknown) {
    if (!isObjectValue(value)) {
        throw new BadRequestException('Query is required')
    }
    const target = parseInstallTarget(Reflect.get(value, 'target'))
    const workspaceId = readStringField(value, 'workspaceId')
    const xpertId = readStringField(value, 'xpertId')
    if (target === 'workspace' && !workspaceId) {
        throw new BadRequestException('workspaceId is required')
    }
    if (target === 'xpert' && !xpertId) {
        throw new BadRequestException('xpertId is required')
    }
    return {
        target,
        workspaceId,
        xpertId,
        agentKey: readStringField(value, 'agentKey')
    }
}

function parseWorkspaceInstallInput(value: unknown) {
    if (!isObjectValue(value)) {
        throw new BadRequestException('Request body is required')
    }
    const workspaceId = readStringField(value, 'workspaceId')
    if (!workspaceId) {
        throw new BadRequestException('workspaceId is required')
    }
    return {
        workspaceId,
        components: normalizeComponentSelectors(Reflect.get(value, 'components'))
    }
}

function parseXpertInstallInput(value: unknown) {
    if (!isObjectValue(value)) {
        throw new BadRequestException('Request body is required')
    }
    const xpertId = readStringField(value, 'xpertId')
    if (!xpertId) {
        throw new BadRequestException('xpertId is required')
    }
    return {
        xpertId,
        agentKey: readStringField(value, 'agentKey'),
        components: normalizeComponentSelectors(Reflect.get(value, 'components'))
    }
}

function normalizeComponentSelectors(components: unknown): PluginResourceInstallComponent[] | undefined {
    if (!Array.isArray(components) || !components.length) {
        return undefined
    }
    return components.filter(isComponentSelector).map((item) => ({
        componentType: item.componentType,
        componentKey: item.componentKey.trim(),
        pluginName: typeof item.pluginName === 'string' ? item.pluginName.trim() : undefined,
        targetAgentKey: typeof item.targetAgentKey === 'string' ? item.targetAgentKey.trim() : undefined,
        policyOverrides: parseMcpPolicy(Reflect.get(item, 'policyOverrides')),
        events: parseStringArray(Reflect.get(item, 'events')),
        auth: parseAuthPolicy(Reflect.get(item, 'auth'))
    }))
}

function isComponentSelector(value: unknown): value is PluginResourceComponentSelector {
    if (!isObjectValue(value)) {
        return false
    }
    const componentKey = readStringField(value, 'componentKey')
    const componentType = Reflect.get(value, 'componentType')
    const pluginName = Reflect.get(value, 'pluginName')
    return (
        !!componentKey &&
        (typeof componentType === 'undefined' || isPluginComponentType(componentType)) &&
        (typeof pluginName === 'undefined' || typeof pluginName === 'string')
    )
}

function isPluginComponentType(value: unknown): value is PluginComponentType {
    return (
        value === PLUGIN_COMPONENT_TYPE.SKILL ||
        value === PLUGIN_COMPONENT_TYPE.MCP_SERVER ||
        value === PLUGIN_COMPONENT_TYPE.APP ||
        value === PLUGIN_COMPONENT_TYPE.HOOK ||
        value === PLUGIN_COMPONENT_TYPE.ASSET
    )
}

function parseInstallTarget(value: unknown): 'workspace' | 'xpert' {
    if (value === 'workspace' || value === 'xpert') {
        return value
    }
    throw new BadRequestException('target must be workspace or xpert')
}

function isObjectValue(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringField(value: object, key: string): string | undefined {
    const field = Reflect.get(value, key)
    return typeof field === 'string' && field.trim() ? field.trim() : undefined
}

function parseStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined
    }
    const items = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter((item) => !!item)
    return items.length ? items : undefined
}

function parseAuthPolicy(value: unknown): 'on_install' | 'on_first_use' | undefined {
    if (value === 'on_install' || value === 'on_first_use') {
        return value
    }
    return undefined
}

function parseMcpPolicy(value: unknown) {
    if (!isObjectValue(value)) {
        return undefined
    }
    const enabled = Reflect.get(value, 'enabled')
    const defaultToolsApprovalMode = parseApprovalMode(Reflect.get(value, 'defaultToolsApprovalMode'))
    const enabledTools = parseStringArray(Reflect.get(value, 'enabledTools'))
    const toolsValue = Reflect.get(value, 'tools')
    const tools: NonNullable<PluginResourceInstallComponent['policyOverrides']>['tools'] = {}
    if (isObjectValue(toolsValue)) {
        for (const [toolName, toolPolicy] of Object.entries(toolsValue)) {
            if (!isObjectValue(toolPolicy)) {
                continue
            }
            const approvalMode = parseApprovalMode(Reflect.get(toolPolicy, 'approvalMode'))
            if (approvalMode) {
                tools[toolName] = { approvalMode }
            }
        }
    }
    const policy: NonNullable<PluginResourceInstallComponent['policyOverrides']> = {
        ...(typeof enabled === 'boolean' ? { enabled } : {}),
        ...(defaultToolsApprovalMode ? { defaultToolsApprovalMode } : {}),
        ...(enabledTools ? { enabledTools } : {}),
        ...(Object.keys(tools).length ? { tools } : {})
    }
    return Object.keys(policy).length ? policy : undefined
}

function parseApprovalMode(value: unknown) {
    if (value === 'prompt' || value === 'approve' || value === 'deny') {
        return value
    }
    return undefined
}
