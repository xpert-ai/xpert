import { AdapterBaseOptions, DBQueryRunner, DBQueryRunnerType } from "./types"

export interface IDataSourceStrategy<TOptions extends AdapterBaseOptions = AdapterBaseOptions> {
  readonly type: string
  readonly name: string
  readonly description?: string

  /**
   * Create a query runner for the given data source options.
   */
  create(options: TOptions): Promise<DBQueryRunner> | DBQueryRunner

  /**
   * Optional configuration schema description for UI generation.
   */
  configurationSchema?(): Promise<Record<string, unknown>> | Record<string, unknown>

  /**
   * Cleanup hook invoked when a runner is no longer needed.
   */
  teardown?(runner: DBQueryRunner): Promise<void> | void

  getClassType(): DBQueryRunnerType
}
