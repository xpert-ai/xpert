import { DynamicStructuredTool } from '@langchain/core/tools'
import { isToolEnabled } from '@xpert-ai/contracts'
import type { IXpertToolset } from '@xpert-ai/contracts'
import { isMcpToolVisibleToModel } from './app-support'
import { getPluginManagedMcpOptions, resolvePluginManagedMcpContract } from './plugin-managed-runtime'

export function filterMcpTools(
    toolset: Partial<IXpertToolset>,
    tools: DynamicStructuredTool[]
): DynamicStructuredTool[] {
    const pluginOptions = getPluginManagedMcpOptions(toolset)
    const pluginContract = pluginOptions ? resolvePluginManagedMcpContract(toolset) : null
    if (pluginOptions && !pluginContract) {
        throw new Error(
            `Plugin-managed MCP component '${pluginOptions.pluginName}:${pluginOptions.componentKey ?? 'missing'}' is not available in the current plugin manifest`
        )
    }
    const manifestAllowlist = pluginContract?.policy.enabledTools
    const disableToolDefault = toolset.options?.disableToolDefault
    return tools.filter((tool) => {
        if (!isMcpToolVisibleToModel(tool)) {
            return false
        }
        if (manifestAllowlist && !manifestAllowlist.includes(tool.name)) {
            return false
        }
        const config = toolset.tools?.find((item) => item.name === tool.name)
        if (config) {
            return isToolEnabled(config, disableToolDefault)
        }
        return !disableToolDefault
    })
}
