import { ChatMessageTypeEnum, IXpertTask, IXpertToolset, JSONValue, TToolCredentials } from '@metad/contracts'
import { shortuuid } from '@metad/server-common'
import { Subscriber } from 'rxjs'
import { BuiltinTool } from '../builtin-tool'
import { BuiltinToolset, TBuiltinToolsetParams } from '../builtin-toolset'
import { TaskCreateTool } from './tools/create'
import { TaskDeleteTool } from './tools/delete'
import { TaskListTool } from './tools/list'
import { TaskToolEnum } from './types'

export class TaskToolset extends BuiltinToolset {
	static provider = 'task'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TBuiltinToolsetParams
	) {
		super(TaskToolset.provider, toolset, params)
	}

	async initTools(): Promise<BuiltinTool[]> {
		this.tools = []
		if (this.toolset?.tools) {
			const enabledTools = this.toolset?.tools.filter((_) => _.enabled)
			if (enabledTools.some((_) => _.name === TaskToolEnum.CREATE_TASK)) {
				this.tools.push(new TaskCreateTool(this))
			}

			if (enabledTools.some((_) => _.name === TaskToolEnum.LIST_TASK)) {
				this.tools.push(new TaskListTool(this))
			}

			if (enabledTools.some((_) => _.name === TaskToolEnum.DELETE_TASK)) {
				this.tools.push(new TaskDeleteTool(this))
			}
		}

		return this.tools
	}

	async _validateCredentials(credentials: TToolCredentials) {
		//
	}

	async sendTasks(subscriber: Subscriber<MessageEvent>, tasks: IXpertTask[], language: string) {
		subscriber.next({
			data: {
				type: ChatMessageTypeEnum.MESSAGE,
				data: {
					id: shortuuid(),
					type: 'component',
					data: {
						type: 'Tasks',
						tasks
					} as unknown as JSONValue
				}
			}
		} as MessageEvent)
	}
}
