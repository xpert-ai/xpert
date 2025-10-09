import { StructuredToolInterface, ToolSchemaBase } from '@langchain/core/tools'
import { BuiltinToolset } from '@xpert-ai/plugin-sdk'
import { buildCalculatorTool } from './tool'

export class CalculatorToolset extends BuiltinToolset {
  override async initTools(): Promise<StructuredToolInterface<ToolSchemaBase, any, any>[]> {
    this.tools = [buildCalculatorTool()]
    return this.tools
  }
}
