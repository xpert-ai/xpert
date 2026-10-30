import { HttpStatus, NotFoundException } from '@nestjs/common'
import {
    I18nObject,
    IconDefinition,
    IXpertTool,
    JSONValue,
    PLUGIN_RESOURCE_ERROR_CODE,
    SkillMetadata,
    XpertToolsetCategoryEnum
} from '@xpert-ai/contracts'
import { normalizePluginName, PluginBundleComponentRegistration } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { mergePluginMcpPolicies, ParsedPluginMcpServer } from '../mcp/plugin-mcp-server-contract'
import type { PluginResourceInstallComponent, RuntimeComponent } from './plugin-resource-installer.types'

export function selectPluginResourceComponents(
    components: PluginBundleComponentRegistration[],
    selectors: PluginResourceInstallComponent[],
    defaultPluginName: string
) {
    const selected = components.filter((component) =>
        selectors.some(
            (selector) =>
                normalizePluginName(selector.pluginName ?? defaultPluginName) === defaultPluginName &&
                selector.componentKey === component.componentKey &&
                (!selector.componentType || selector.componentType === component.componentType)
        )
    )
    if (!selected.length) {
        throw new NotFoundException({
            statusCode: HttpStatus.NOT_FOUND,
            errorCode: PLUGIN_RESOURCE_ERROR_CODE.NO_MATCHING_COMPONENTS,
            message: t('server-ai:Error.NoMatchingPluginComponents', {
                defaultValue: 'No matching plugin components were found.'
            })
        })
    }
    return selected
}

/**
 * Restores per-Agent selector cardinality after component discovery has
 * de-duplicated portable plugin resources by component identity.
 */
export function expandPluginRuntimeComponents(
    components: PluginBundleComponentRegistration[],
    selectors: PluginResourceInstallComponent[],
    normalizedPluginName: string,
    rootDir: string,
    pluginVersion?: string
): RuntimeComponent[] {
    return selectors.flatMap((selector) => {
        if (selector.pluginName && normalizePluginName(selector.pluginName) !== normalizedPluginName) {
            return []
        }
        return components
            .filter(
                (component) =>
                    selector.componentKey === component.componentKey &&
                    (!selector.componentType || selector.componentType === component.componentType)
            )
            .map((component) => ({
                pluginName: normalizedPluginName,
                pluginVersion,
                component,
                rootDir,
                targetAgentKey: selector.targetAgentKey,
                policyOverrides: selector.policyOverrides,
                events: selector.events,
                auth: selector.auth
            }))
    })
}

export function buildPluginManagedMcpToolsetEntity(
    runtimeComponent: RuntimeComponent,
    workspaceId: string,
    xpertId: string | null,
    parsed: ParsedPluginMcpServer
): Partial<XpertToolset> {
    const policy = mergePluginMcpPolicies(parsed.policy, runtimeComponent.policyOverrides)
    const enabledTools = policy.enabledTools ?? []
    const tools: IXpertTool[] = enabledTools.map((name) => ({
        name,
        disabled: false,
        enabled: true,
        options: {
            approvalMode: policy.tools?.[name]?.approvalMode ?? policy.defaultToolsApprovalMode
        }
    }))
    return {
        workspaceId,
        name: `${runtimeComponent.component.componentKey} MCP`,
        type: runtimeComponent.component.componentKey,
        category: XpertToolsetCategoryEnum.MCP,
        description: `Plugin-managed MCP server from ${runtimeComponent.pluginName}`,
        schema: JSON.stringify({
            mcpServers: {
                [runtimeComponent.component.componentKey]: runtimeComponent.portableServer ?? parsed.server
            }
        }),
        options: {
            disableToolDefault: policy.enabledTools !== undefined,
            needSandbox: runtimeComponent.runtimeSource !== 'agent-plugin',
            pluginManaged: runtimeComponent.runtimeSource !== 'agent-plugin',
            ...(runtimeComponent.runtimeSource ? { runtimeSource: runtimeComponent.runtimeSource } : {}),
            pluginName: runtimeComponent.pluginName,
            componentKey: runtimeComponent.component.componentKey,
            ...(xpertId ? { xpertId } : {}),
            definitionHash: runtimeComponent.component.definitionHash,
            ...(policy.runtime ? { mcpRuntime: policy.runtime } : {}),
            policy
        },
        tools
    }
}

export function isObjectValue(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function safeMessage(error: unknown) {
    return (error instanceof Error ? error.message : String(error)).slice(0, 500)
}

export function componentIdentity(
    component: Pick<PluginBundleComponentRegistration, 'componentType' | 'componentKey'>
) {
    return `${component.componentType}:${component.componentKey}`
}

export function preserveManagedMcpConfig(
    next: JSONValue | null,
    previous: JSONValue | null | undefined
): JSONValue | null {
    if (!isObjectValue(next) || Reflect.get(next, 'runtimeDiscovered') !== true || !isObjectValue(previous)) {
        return next
    }
    const publicationId = readStringField(previous, 'publicationId')
    const protocolVersion = readStringField(previous, 'protocolVersion')
    return {
        ...Object.fromEntries(Object.entries(next)),
        ...(publicationId ? { publicationId } : {}),
        ...(protocolVersion ? { protocolVersion } : {})
    } as JSONValue
}

export function readStringField(value: object, key: string): string | undefined {
    const field = Reflect.get(value, key)
    return typeof field === 'string' && field.trim() ? field.trim() : undefined
}

export function isPluginNativeToolset(toolset: XpertToolset, pluginName: string, componentKey: string) {
    const options = toolset.options
    if (!isObjectValue(options)) {
        return false
    }
    return (
        Reflect.get(options, 'pluginManaged') === true &&
        Reflect.get(options, 'pluginName') === pluginName &&
        Reflect.get(options, 'componentKey') === componentKey
    )
}

export function buildSkillMetadataOverrides(value: unknown): Partial<SkillMetadata> | null {
    if (!isObjectValue(value)) {
        return null
    }

    const metadata: Partial<SkillMetadata> = {}
    const displayName = readI18nObjectField(value, 'displayName')
    const description = readI18nObjectField(value, 'description')
    const icon = readIconDefinitionField(value, 'icon')
    const color = readStringField(value, 'color')

    if (displayName) {
        metadata.displayName = displayName
    }
    if (description) {
        metadata.description = description
    }
    if (icon) {
        metadata.icon = icon
    }
    if (color) {
        metadata.color = color
    }

    return Object.keys(metadata).length ? metadata : null
}

export function readI18nObjectField(value: object, key: string): I18nObject | undefined {
    const field = Reflect.get(value, key)
    if (typeof field === 'string' && field.trim()) {
        return toI18nObject(field.trim())
    }
    if (!isObjectValue(field)) {
        return undefined
    }

    const enUS = readStringField(field, 'en_US')
    const zhHans = readStringField(field, 'zh_Hans')
    const fallback = enUS ?? zhHans
    return fallback
        ? {
              en_US: fallback,
              ...(zhHans ? { zh_Hans: zhHans } : {})
          }
        : undefined
}

export function toI18nObject(value: string): I18nObject {
    return {
        en_US: value,
        zh_Hans: value
    }
}

export function readIconDefinitionField(value: object, key: string): IconDefinition | undefined {
    const field = Reflect.get(value, key)
    if (!isObjectValue(field)) {
        return undefined
    }
    const type = readStringField(field, 'type')
    const iconValue = readStringField(field, 'value')
    if (!type || !iconValue) {
        return undefined
    }

    return field as IconDefinition
}

export function safePathSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

export function isHookRef(value: unknown): value is { pluginName: string; componentKey: string; events?: string[] } {
    if (!isObjectValue(value)) {
        return false
    }
    const pluginName = Reflect.get(value, 'pluginName')
    const componentKey = Reflect.get(value, 'componentKey')
    const events = Reflect.get(value, 'events')
    return (
        typeof pluginName === 'string' &&
        !!pluginName.trim() &&
        typeof componentKey === 'string' &&
        !!componentKey.trim() &&
        (typeof events === 'undefined' || (Array.isArray(events) && events.every((event) => typeof event === 'string')))
    )
}
