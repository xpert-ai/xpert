import { StructuredToolInterface, ToolSchemaBase } from '@langchain/core/tools'
import { BuiltinToolset } from '@xpert-ai/plugin-sdk'
import { buildCalculatorTool } from './tool'

export class CalculatorToolset extends BuiltinToolset<StructuredToolInterface, Record<string, never>> {
  override async _validateCredentials(credentials: Record<string, never>): Promise<void> {
    // No credentials needed for calculator toolset
  }
  override async initTools(): Promise<StructuredToolInterface<ToolSchemaBase, any, any>[]> {
    this.tools = [buildCalculatorTool()]
    return this.tools
  }
}
