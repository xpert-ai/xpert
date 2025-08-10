import { CallbackManagerForChainRun } from "@langchain/core/callbacks/manager";
import {
  ToolMessage,
  AIMessage,
  isBaseMessage,
} from "@langchain/core/messages";
import { mergeConfigs, patchConfig, Runnable, RunnableConfig, RunnableToolLike } from "@langchain/core/runnables";
import { StructuredToolInterface } from "@langchain/core/tools";
import { AsyncLocalStorageProviderSingleton } from "@langchain/core/singletons";
import { Command, isCommand, isGraphInterrupt } from "@langchain/langgraph";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import { channelName, ChatMessageEventTypeEnum, CONTEXT_VARIABLE_CURRENTSTATE, TVariableAssigner } from "@metad/contracts";
import { getErrorMessage } from "@metad/server-common";
import { setContextVariable } from "@langchain/core/context";

export type ToolNodeOptions = {
  name?: string;
  tags?: string[];
  handleToolErrors?: boolean;
  caller?: string
  variables?: TVariableAssigner[]
  toolName: string
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
  channel: string
  toolName: string

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
    this.toolName = options?.toolName

    this.channel = options?.caller ? channelName(options.caller) : null
    // this.toolset = options?.toolset
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async run(input: any, config: RunnableConfig): Promise<T> {
    const message = Array.isArray(input)
      ? input[input.length - 1] : this.channel ?
       input[this.channel].messages[input[this.channel].messages.length - 1]
         : input.messages[input.messages.length - 1]

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
            {
              ...config,
              metadata: {
                toolName: this.toolName
              },
              configurable: {
                ...config.configurable,
                tool_call_id: call.id,
                // toolset: this.toolset
              }
            }
          );
          if (isBaseMessage(output) && output._getType() === "tool") {
            if (this.variables) {
              const variables = this.variables.reduce((acc, curr) => {
                if (curr.inputType === 'variable') {
                  if (curr.value === 'artifact') {
                    acc[curr.variableSelector] = (<ToolMessage>output).artifact
                  } else {
                    acc[curr.variableSelector] = (<ToolMessage>output).content
                  }
                } else if (curr.inputType === 'constant') {
                  acc[curr.variableSelector] = curr.value
                }
                return acc
              }, {})
              return new Command({
                update:
                  {
                    ...variables,
                    // [`${this.channel}.messages`]: [output],
                    [this.channel]: {messages: [output]},
                    messages: [output],
                  }
              })
            }
            return output;
          } else if (isCommand(output)) {
            // Migrate messages into agent channel
            const update = output.update
            if (Array.isArray(update)) {
              output.update = update.map((_) => {
                if (_[0] === 'messages') {
                  return [this.channel, {messages: _[1]}] as [string, unknown]
                }
                return _
              })
            } else {
              output.update = {
                ...update,
                [this.channel]:  {messages: update.messages},
              }
            }
            
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
          if (isGraphInterrupt(e)) {
            // `NodeInterrupt` errors are a breakpoint to bring a human into the loop.
            // As such, they are not recoverable by the agent and shouldn't be fed
            // back. Instead, re-throw these errors even when `handleToolErrors = true`.
            throw e;
          }

          await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_ERROR, {
            toolCall: call,
            error: getErrorMessage(e)
          })

          const toolMessage = new ToolMessage({
            content: `Error: ${e.message}\n Please fix your mistakes.`,
            name: call.name,
            tool_call_id: call.id ?? "",
          })
          // Return back to caller agent when error
          return new Command({
            goto: this.caller,
            update: {
              messages: [toolMessage],
              [this.channel]: {messages: [toolMessage]},
            }
          })
        }
      }) ?? []
    );

     // Preserve existing behavior for non-command tool outputs for backwards compatibility
     if (!outputs.some(isCommand)) {
      return (Array.isArray(input) ? outputs : { messages: outputs, [this.channel]: {messages: outputs} }) as T;
    }

    // Handle mixed Command and non-Command outputs
    const combinedOutputs = outputs.map((output) => {
      if (isCommand(output)) {
        return output;
      }
      return Array.isArray(input) ? [output] : { messages: [output], [this.channel]: {messages: [output]} };
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let returnValue: any;
    // const config = ensureLangGraphConfig(options);
    const mergedConfig = mergeConfigs(this.config, options);

    setContextVariable(CONTEXT_VARIABLE_CURRENTSTATE, input);

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
        async () => {
          return returnValue.invoke(input, mergedConfig);
      });
    }

    return returnValue;
  }
}
