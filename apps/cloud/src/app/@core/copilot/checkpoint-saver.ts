import { HttpClient } from '@angular/common/http'
import { inject, Injectable, Provider } from '@angular/core'
import { RunnableConfig } from '@langchain/core/runnables'
import { PendingWrite, type CheckpointListOptions } from '@langchain/langgraph-checkpoint'
import { BaseCheckpointSaver, Checkpoint, CheckpointMetadata, CheckpointTuple } from '@langchain/langgraph/web'
import { firstValueFrom } from 'rxjs'
import { API_COPILOT_CHECKPOINT } from '../constants/app.constants'

@Injectable({
  providedIn: 'root'
})
export class CopilotCheckpointSaver extends BaseCheckpointSaver {
  

  readonly #httpClient = inject(HttpClient)

  constructor() {
    super()
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const { thread_id, checkpoint_ns, checkpoint_id } = config.configurable || {}

    const row = await firstValueFrom(
      this.#httpClient.get<CheckpointTuple | null>(API_COPILOT_CHECKPOINT, {
        params: {
          $filter: JSON.stringify({
            thread_id,
            checkpoint_ns,
            checkpoint_id
          })
        }
      })
    )

    if (row) {
      return {
        config,
        ...row,
        checkpoint: (await this.serde.loadsTyped('json', this.fromJSON(row.checkpoint))) as Checkpoint,
        metadata: (await this.serde.loadsTyped('json', this.fromJSON(row.metadata))) as CheckpointMetadata
      }
    }

    return undefined
  }

  async *list(config: RunnableConfig, options?: CheckpointListOptions): AsyncGenerator<CheckpointTuple> {
    console.log(`list checkpoints:`, config, options)
  }

  async put(config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata): Promise<RunnableConfig> {
    const [type1, serializedCheckpoint] = await this.serde.dumpsTyped(checkpoint)
    const [type2, serializedMetadata] = await this.serde.dumpsTyped(metadata)

    await firstValueFrom(
      this.#httpClient.post(API_COPILOT_CHECKPOINT, {
        thread_id: config.configurable?.thread_id,
        checkpoint_ns: config.configurable?.checkpoint_ns,
        checkpoint_id: checkpoint.id,
        parent_id: config.configurable?.checkpoint_id,
        type: type1,
        checkpoint: this.toJSON(serializedCheckpoint),
        metadata: this.toJSON(serializedMetadata),
      })
    )

    return {
      configurable: {
        thread_id: config.configurable?.thread_id,
        checkpoint_ns: config.configurable?.checkpoint_ns,
        checkpoint_id: checkpoint.id
      }
    }
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const rows = writes.map((write, idx) => {
      // const [type, serializedWrite] = this.serde.dumpsTyped(write[1])
      return {
        thread_id: config.configurable?.thread_id,
        checkpoint_ns: config.configurable?.checkpoint_ns,
        checkpoint_id: config.configurable?.checkpoint_id,
        task_id: taskId,
        idx,
        channel: write[0],
        // type,
        value: write[1]
      }
    })

    await firstValueFrom(this.#httpClient.post(API_COPILOT_CHECKPOINT + '/writes', rows))
  }

  deleteThread(threadId: string): Promise<void> {
    throw new Error('Method not implemented.')
  }

  toJSON(data: Uint8Array) {
    return {
      type: "Buffer",
      data: Array.from(data)
    }
  }
  
  fromJSON(value: object | string) {
    if (typeof value === 'object' && value['type'] === 'Buffer') {
      return new Uint8Array(value['data'])
    }
  
    return new TextEncoder().encode(value as string)
  }
  
}

export function provideCheckpointSaver(): Provider[] {
  return [
    {
      provide: BaseCheckpointSaver,
      useExisting: CopilotCheckpointSaver
    }
  ]
}
