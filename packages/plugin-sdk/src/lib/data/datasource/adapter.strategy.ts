import { IDataSourceStrategy } from './strategy.interface'
import { AdapterBaseOptions, DBQueryRunner, DBQueryRunnerType } from './types'

/**
 * Helper base class to wrap existing adapter query runner implementations
 * into datasource strategies consumable by the plugin SDK.
 */
export abstract class AdapterDataSourceStrategy<TOptions extends AdapterBaseOptions = AdapterBaseOptions>
  implements IDataSourceStrategy<TOptions>
{
  abstract readonly type: string
  abstract readonly name: string
  readonly description?: string

  private configurationSchemaCache: Record<string, unknown> | undefined

  protected constructor(
    private readonly runnerClass: DBQueryRunnerType,
    private readonly extraArgs: unknown[] = []
  ) {}

  async create(options: TOptions): Promise<DBQueryRunner> {
    return this.instantiateRunner(options)
  }

  async configurationSchema(): Promise<Record<string, unknown>> {
    if (!this.configurationSchemaCache) {
      const runner = this.instantiateRunner(undefined)
      this.configurationSchemaCache = runner?.configurationSchema ?? {}
      await runner?.teardown?.()
    }
    return this.configurationSchemaCache
  }

  async teardown(runner: DBQueryRunner): Promise<void> {
    await runner?.teardown?.()
  }

  protected instantiateRunner(options: TOptions | undefined): DBQueryRunner {
    return new this.runnerClass(options as AdapterBaseOptions, ...this.extraArgs)
  }

  getClassType(): DBQueryRunnerType {
    return this.runnerClass
  }
}
