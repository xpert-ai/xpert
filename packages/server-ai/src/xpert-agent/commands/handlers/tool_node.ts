import { CallbackManagerForChainRun } from "@langchain/core/callbacks/manager";
import {
  BaseMessage,
  ToolMessage,
  AIMessage,
  isBaseMessage,
} from "@langchain/core/messages";
import { mergeConfigs, patchConfig, Runnable, RunnableConfig, RunnableToolLike } from "@langchain/core/runnables";
import { StructuredToolInterface } from "@langchain/core/tools";
import { AsyncLocalStorageProviderSingleton } from "@langchain/core/singletons";
import { Command, END, isCommand, isGraphInterrupt, MessagesAnnotation } from "@langchain/langgraph";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import { ChatMessageEventTypeEnum, CONTEXT_VARIABLE_CURRENTSTATE, TVariableAssigner } from "@metad/contracts";
import { getErrorMessage } from "@metad/server-common";
import { setContextVariable } from "@langchain/core/context";

export type ToolNodeOptions = {
  name?: string;
  tags?: string[];
  handleToolErrors?: boolean;
  caller?: string
  variables?: TVariableAssigner[]
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ToolNode<T = any> extends Runnable<T, T> {

  lc_namespace: string[];
  tools: (StructuredToolInterface | RunnableToolLike)[];

  handleToolErrors = true;

  trace = false;
  config?: RunnableConfig;
  recurse = true;
  caller?: string
  variables: TVariableAssigner[]

  constructor(
    tools: (StructuredToolInterface | RunnableToolLike)[],
    options?: ToolNodeOptions
  ) {
    const { name, tags, handleToolErrors } = options ?? {};
    super({ name, tags });
    this.tools = tools;
    this.handleToolErrors = handleToolErrors ?? this.handleToolErrors;
    this.caller = options?.caller
    this.variables = options?.variables
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async run(input: any, config: RunnableConfig): Promise<T> {
    const message = Array.isArray(input)
      ? input[input.length - 1]
      : input.messages[input.messages.length - 1];

    if (message?._getType() !== "ai") {
      throw new Error("ToolNode only accepts AIMessages as input.");
    }

    const tool_calls = input.toolCall ? [input.toolCall] : (message as AIMessage).tool_calls

    const outputs = await Promise.all(
      tool_calls?.map(async (call) => {
        const tool = this.tools.find((tool) => tool.name === call.name);
        try {
          if (tool === undefined) {
            throw new Error(`Tool "${call.name}" not found.`);
          }
          const output = await tool.invoke(
            { ...call, type: "tool_call" },
            config
          );
          if (isBaseMessage(output) && output._getType() === "tool") {
            if (this.variables) {
              console.warn(this.variables)
              /**
               * [
                  {
                    id: 'UQrgAkR8EM',
                    variableSelector: 'memories',
                    operation: 'append',
                    inputType: 'variable'
                  }
                ]
               */
              const variables = this.variables.reduce((acc, curr) => {
                if (curr.inputType === 'variable') {
                  acc[curr.variableSelector] = (<ToolMessage>output).artifact
                }
                return acc
              }, {})
              return new Command({
                update: 
                  {
                    ...variables,
                    [`${this.caller}.messages`]: [output],
                    messages: [output],
                  }
              })
            }
            return output;
          } else if (isCommand(output)) {
            return output;
          } else {
            return new ToolMessage({
              name: tool.name,
              content:
                typeof output === "string" ? output : JSON.stringify(output),
              tool_call_id: call.id,
            });
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
          if (!this.handleToolErrors) {
            throw e;
          }
          if (isGraphInterrupt(e.name)) {
            // `NodeInterrupt` errors are a breakpoint to bring a human into the loop.
            // As such, they are not recoverable by the agent and shouldn't be fed
            // back. Instead, re-throw these errors even when `handleToolErrors = true`.
            throw e;
          }

          await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_ERROR, {
            toolCall: call,
            error: getErrorMessage(e)
          })
          return new ToolMessage({
            content: `Error: ${e.message}\n Please fix your mistakes.`,
            name: call.name,
            tool_call_id: call.id ?? "",
          });
        }
      }) ?? []
    );

     // Preserve existing behavior for non-command tool outputs for backwards compatibility
     if (!outputs.some(isCommand)) {
      return (Array.isArray(input) ? outputs : { messages: outputs }) as T;
    }

    // Handle mixed Command and non-Command outputs
    const combinedOutputs = outputs.map((output) => {
      if (isCommand(output)) {
        return output;
      }
      return Array.isArray(input) ? [output] : { messages: [output] };
    });
    return combinedOutputs as T;
  }

  protected async _tracedInvoke(
    input: T,
    config?: Partial<RunnableConfig>,
    runManager?: CallbackManagerForChainRun
  ) {
    return new Promise<T>((resolve, reject) => {
      const childConfig = patchConfig(config, {
        callbacks: runManager?.getChild(),
      });
      void AsyncLocalStorageProviderSingleton.runWithConfig(
        childConfig,
        async () => {
          try {
            const output = await this.run(input, childConfig);
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
    input: any,
    options?: Partial<RunnableConfig> | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {

    // We set a context variable before invoking the tool node and running our tool.
    setContextVariable(CONTEXT_VARIABLE_CURRENTSTATE, input);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let returnValue: any;
    // const config = ensureLangGraphConfig(options);
    const mergedConfig = mergeConfigs(this.config, options);

    if (this.trace) {
      returnValue = await this._callWithConfig(
        this._tracedInvoke,
        input,
        mergedConfig
      );
    } else {
      returnValue = await AsyncLocalStorageProviderSingleton.runWithConfig(
        mergedConfig,
        async () => this.run(input, mergedConfig)
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

export function toolsCondition(
  state: BaseMessage[] | typeof MessagesAnnotation.State
): "tools" | typeof END {
  const message = Array.isArray(state)
    ? state[state.length - 1]
    : state.messages[state.messages.length - 1];

  if (
    "tool_calls" in message &&
    ((message as AIMessage).tool_calls?.length ?? 0) > 0
  ) {
    return "tools";
  } else {
    return END;
  }
}
