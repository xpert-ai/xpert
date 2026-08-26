import { DynamicStructuredTool } from '@langchain/core/tools'
import { BadRequestException, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { createMCPClient } from '../../provider/mcp/types'
import { MCPToolsBySchemaCommand } from '../mcp-tools-schema.command'
import { XpertToolsetService } from '../../xpert-toolset.service'
import { createProMCPClient } from '../../provider/mcp/pro'
import { EnvStateQuery } from '../../../environment'
import { ToolSchemaParser } from '../../../shared'
import { getMcpToolAppMeta } from '../../provider/mcp/app-support'
import { filterMcpTools } from '../../provider/mcp/mcp-tool-filter'
import { getPluginManagedMcpOptions } from '../../provider/mcp/plugin-managed-runtime'

@CommandHandler(MCPToolsBySchemaCommand)
export class MCPToolsBySchemaHandler implements ICommandHandler<MCPToolsBySchemaCommand> {
    readonly #logger = new Logger(MCPToolsBySchemaHandler.name)

    constructor(
        private readonly toolsetService: XpertToolsetService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    public async execute(command: MCPToolsBySchemaCommand): Promise<any> {
        const toolset = await this.resolveToolset(command.toolset)
        const schema = JSON.parse(toolset.schema)
        const envState = await this.queryBus.execute(new EnvStateQuery(toolset.workspaceId))

        // Create a client
        const { client, destroy, logs } = this.toolsetService.isPro()
            ? await createProMCPClient(toolset, null, this.commandBus, schema, envState)
            : await createMCPClient(toolset, schema, envState)

        try {
            const tools = filterMcpTools(toolset, await client.getTools())
            return {
                tools: tools.map((tool) => {
                    ;(<DynamicStructuredTool>tool).verboseParsingErrors = true
                    const mcpApp = getMcpToolAppMeta(tool as DynamicStructuredTool)
                    return {
                        name: tool.name,
                        description: tool.description,
                        schema:
                            (<DynamicStructuredTool>tool).lc_kwargs?.schema ??
                            ToolSchemaParser.parseZodToJsonSchema(tool.schema),
                        ...(mcpApp
                            ? {
                                  mcp: {
                                      serverName: mcpApp.serverName,
                                      name: mcpApp.name,
                                      displayName: mcpApp.displayName,
                                      visibility: mcpApp.visibility,
                                      ui: mcpApp.ui
                                  },
                                  _meta: mcpApp._meta
                              }
                            : {})
                    }
                }),
                logs
            }
        } finally {
            if (destroy) {
                await destroy().catch((err) => this.#logger.debug(err))
            }
            await client.close().catch((err) => this.#logger.debug(err))
        }
    }

    private async resolveToolset(toolset: MCPToolsBySchemaCommand['toolset']) {
        const requestedPlugin = getPluginManagedMcpOptions(toolset)
        if (!requestedPlugin) {
            return toolset
        }
        if (!toolset.id) {
            throw new BadRequestException('Plugin-managed MCP discovery requires an installed toolset id')
        }
        const installed = await this.toolsetService.findOne(toolset.id, { relations: ['tools'] })
        const installedPlugin = getPluginManagedMcpOptions(installed)
        if (
            !installedPlugin ||
            installedPlugin.pluginName !== requestedPlugin.pluginName ||
            installedPlugin.componentKey !== requestedPlugin.componentKey
        ) {
            throw new BadRequestException('Plugin-managed MCP discovery must use the installed plugin component')
        }
        return installed
    }
}
