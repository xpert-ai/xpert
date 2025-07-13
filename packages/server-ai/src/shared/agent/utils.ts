import { CallbackManagerForChainRun } from "@langchain/core/callbacks/manager";
import {
  mergeConfigs,
  patchConfig,
  Runnable,
  RunnableConfig,
} from "@langchain/core/runnables";
import { AsyncLocalStorageProviderSingleton } from "@langchain/core/singletons";
import { AsyncBatchedStore, BaseStore } from "@langchain/langgraph";
import { IXpertAgent } from "@metad/contracts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RunnableCallableArgs extends Partial<any> {
  name?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  func: (...args: any[]) => any;
  tags?: string[];
  trace?: boolean;
  recurse?: boolean;
}

export class RunnableCallable<I = unknown, O = unknown> extends Runnable<I, O> {
  lc_namespace: string[] = ["langgraph"];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  func: (...args: any[]) => any;

  tags?: string[];

  config?: RunnableConfig;

  trace = true;

  recurse = true;

  constructor(fields: RunnableCallableArgs) {
    super();
    this.name = fields.name ?? fields.func.name;
    this.func = fields.func;
    this.config = fields.tags ? { tags: fields.tags } : undefined;
    this.trace = fields.trace ?? this.trace;
    this.recurse = fields.recurse ?? this.recurse;
  }

  protected async _tracedInvoke(
    input: I,
    config?: Partial<RunnableConfig>,
    runManager?: CallbackManagerForChainRun
  ) {
    return new Promise<O>((resolve, reject) => {
      const childConfig = patchConfig(config, {
        callbacks: runManager?.getChild(),
      });
      void AsyncLocalStorageProviderSingleton.runWithConfig(
        childConfig,
        async () => {
          try {
            const output = await this.func(input, childConfig);
            resolve(output);
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  }

  async invoke(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: I,
    options?: Partial<RunnableConfig> | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<O> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let returnValue: any;
    const config = options
    const mergedConfig = mergeConfigs(this.config, config);

    if (this.trace) {
      returnValue = await this._callWithConfig(
        this._tracedInvoke,
        input,
        mergedConfig
      );
    } else {
      returnValue = await AsyncLocalStorageProviderSingleton.runWithConfig(
        mergedConfig,
        async () => this.func(input, mergedConfig)
      );
    }

    if (Runnable.isRunnable(returnValue) && this.recurse) {
      return await AsyncLocalStorageProviderSingleton.runWithConfig(
        mergedConfig,
        async () => returnValue.invoke(input, mergedConfig)
      );
    }

    return returnValue;
  }
}

export function identifyAgent(agent: IXpertAgent) {
	return {
		id: agent.id,
		key: agent.key,
		name: agent.name,
		title: agent.title,
		description: agent.description,
		avatar: agent.avatar
	}
}

export function isKeyEqual(a: string, b: string): boolean {
  return a?.toLowerCase() === b?.toLowerCase()
}

/**
 * Recursively extracts and returns the underlying store from an `AsyncBatchedStore`,
 * until a non-`AsyncBatchedStore` is found.
 */
export const extractStore = (input: BaseStore | AsyncBatchedStore): BaseStore => {
  let current = input;
  while (current instanceof AsyncBatchedStore) {
    // @ts-expect-error is a protected property
    current = current.store;
  }
  return current;
}