import { Injectable } from '@nestjs/common'
import { BuiltinToolset, IToolsetStrategy, ToolsetStrategy } from '@xpert-ai/plugin-sdk'
import { Calculator, icon } from './types'
import { buildCalculatorTool } from './tool'
import { CalculatorToolset } from './toolset'

@Injectable()
@ToolsetStrategy(Calculator)
export class CalculatorStrategy implements IToolsetStrategy<any> {

  meta = {
    author: 'Xpert AI',
    tags: ['calculator', 'tool'],
    name: Calculator,
    label: {
      en_US: 'Calculator',
      zh_Hans: '计算器'
    },
    description: {
      en_US:
        'Calculator toolset.',
      zh_Hans: '计算器工具集。'
    },
    icon: {
      png: icon,
      color: '#14b8a6'
    },
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  validateConfig(config: any): Promise<void> {
    throw new Error('Method not implemented.')
  }
  async create(config: any): Promise<BuiltinToolset> {
    return new CalculatorToolset(config)
  }

  createTools() {
    return [
      buildCalculatorTool()
    ]
  }
}
