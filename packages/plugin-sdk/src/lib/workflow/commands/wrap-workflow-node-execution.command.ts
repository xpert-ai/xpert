import { IXpertAgentExecution } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'
import {
  AgentMiddlewareWrapWorkflowNodeExecutionParams,
  AgentMiddlewareWrapWorkflowNodeExecutionResult,
} from '../../agent/middleware/runtime'

const COMMAND_METADATA = '__command__'

/**
 * Wrap Workflow Node Execution Command
 *
 * @deprecated Prefer `IAgentMiddlewareContext.runtime.wrapWorkflowNodeExecution(...)` in middleware and plugin code.
 */
export class WrapWorkflowNodeExecutionCommand<T = any> extends Command<T> {
  static readonly type = '[Workflow] Wrap Workflow Node Execution'

  constructor(
    public readonly fuc: (
      execution: Partial<IXpertAgentExecution>
    ) => Promise<AgentMiddlewareWrapWorkflowNodeExecutionResult<T>>,
    public readonly params: AgentMiddlewareWrapWorkflowNodeExecutionParams
  ) {
    super()
  }
}

Reflect.defineMetadata(
  COMMAND_METADATA,
  { id: WrapWorkflowNodeExecutionCommand.type },
  WrapWorkflowNodeExecutionCommand
)
