import { IXpertAgentExecution, JSONValue } from '@metad/contracts'
import { Command } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'

/**
 * Wrap Workflow Node Execution Command
 */
export class WrapWorkflowNodeExecutionCommand<T = any> extends Command<T> {
  static readonly type = '[Workflow] Wrap Workflow Node Execution'

  constructor(
    public readonly fuc: (
      execution: Partial<IXpertAgentExecution>
    ) => Promise<{ output?: string | JSONValue; state: T }>,
    public readonly params: {
      execution: Partial<IXpertAgentExecution>
      subscriber?: Subscriber<MessageEvent>
      catchError?: (error: Error) => Promise<void>
    }
  ) {
    super()
  }
}
