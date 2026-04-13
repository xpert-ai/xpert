import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { RunnableConfig } from '@langchain/core/runnables'
import { Tool } from '@langchain/core/tools'
import { IXpertToolset } from '@xpert-ai/contracts'
import { BaseToolset } from './toolset'

class MockTool extends Tool {
	name = 'mockTool'
	description: string
	// 其他必要的属性和方法
	protected _call(arg: any, runManager?: CallbackManagerForToolRun, parentConfig?: RunnableConfig): Promise<any> {
		throw new Error('Method not implemented.')
	}
}

class MockToolset extends BaseToolset {

}

describe('BaseToolset', () => {
	let baseToolset: BaseToolset
	let mockToolset: IXpertToolset

	beforeEach(() => {
		mockToolset = {
			// 初始化 IXpertToolset 的必要属性
		} as IXpertToolset
		baseToolset = new MockToolset(mockToolset)
		baseToolset.tools = [new MockTool()]
	})

	it('should return tools', () => {
		const tools = baseToolset.getTools()
		expect(tools).toHaveLength(1)
		expect(tools[0].name).toBe('mockTool')
	})

	it('should return a specific tool by name', () => {
		const tool = baseToolset.getTool('mockTool')
		expect(tool).not.toBeUndefined()
		expect(tool.name).toBe('mockTool')
	})

	it('should return undefined for a non-existent tool', () => {
		const tool = baseToolset.getTool('nonExistentTool')
		expect(tool).toBeUndefined()
	})
})
