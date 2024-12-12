import {
  BaseMessage,
  BaseMessageChunk,
  isAIMessage,
  SystemMessage,
} from "@langchain/core/messages";
import {
  Runnable,
  RunnableInterface,
  RunnableLambda,
  RunnableLike,
  RunnableToolLike,
} from "@langchain/core/runnables";
import { DynamicTool, StructuredToolInterface } from "@langchain/core/tools";
import {
  BaseLanguageModelCallOptions,
  BaseLanguageModelInput,
} from "@langchain/core/language_models/base";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseCheckpointSaver, CompiledStateGraph, END, Send, START, StateGraph } from "@langchain/langgraph";
import { All } from "@langchain/langgraph-checkpoint";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ToolNode } from "./tool_node";
import { AgentStateAnnotation } from "./types";

type AgentState = typeof AgentStateAnnotation.State

export type N = any

export type CreateReactAgentParams = {
  llm: BaseChatModel;
  messageModifier?:
    | SystemMessage
    | string
    | ((state: AgentState) => BaseMessage[])
    | ((state: AgentState) => Promise<BaseMessage[]>)
    | Runnable;
  checkpointSaver?: BaseCheckpointSaver;
  interruptBefore?: N[] | All;
  interruptAfter?: N[] | All;
  state?: typeof AgentStateAnnotation
  tags?: string[]
  subAgents: Record<string,  {tool: StructuredToolInterface | RunnableToolLike; node: RunnableLike<AgentState>}>
  tools?: (StructuredToolInterface | RunnableToolLike)[];
};

/**
 * Creates a StateGraph agent that relies on a chat llm utilizing tool calling.
 * @param llm The chat llm that can utilize OpenAI-style function calling.
 * @param tools A list of tools or a ToolNode.
 * @param messageModifier An optional message modifier to apply to messages before being passed to the LLM.
 * Can be a SystemMessage, string, function that takes and returns a list of messages, or a Runnable.
 * @param checkpointSaver An optional checkpoint saver to persist the agent's state.
 * @param interruptBefore An optional list of node names to interrupt before running.
 * @param interruptAfter An optional list of node names to interrupt after running.
 * @returns A compiled agent as a LangChain Runnable.
 */
export function createReactAgent(
  props: CreateReactAgentParams
): CompiledStateGraph<
  AgentState,
  Partial<AgentState>,
  typeof START | "agent" | string
> {
  const {
    llm,
    tools,
    subAgents,
    messageModifier,
    checkpointSaver,
    interruptBefore,
    interruptAfter,
    state,
    tags,
  } = props;

  const toolClasses: (StructuredToolInterface | DynamicTool | RunnableToolLike)[] = []
  if (tools) {
    toolClasses.push(...tools)
  }
  if (subAgents) {
    Object.keys(subAgents).forEach((name) => {
      toolClasses.push(subAgents[name].tool)
    })
  }

  if (!("bindTools" in llm) || typeof llm.bindTools !== "function") {
    throw new Error(`llm ${llm} must define bindTools method.`);
  }
  const modelWithTools = llm.bindTools(toolClasses);
  const modelRunnable = _createModelWrapper(modelWithTools, messageModifier);

  const shouldContinue = (state: AgentState) => {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];
    if (isAIMessage(lastMessage)) {
      if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
        return END;
      }

      return lastMessage.tool_calls.map((toolCall) => new Send(toolCall.name, { ...state, toolCall }) )
    }

    return END;
  };

  const callModel = async (state: AgentState) => {
    const { messages } = state;
    // TODO: Auto-promote streaming.
    return { messages: [await modelRunnable.invoke(state as any)] };
  };

  const workflow = new StateGraph(state ?? AgentStateAnnotation)
    .addNode(
      "agent",
      new RunnableLambda({ func: callModel }).withConfig({ runName: "agent", tags })
    )
    // .addNode("tools", tools)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue,)
    // .addConditionalEdges("tools", shouldToolContinue ?? ((state: AgentState) => "agent"))

  if (subAgents) {
    Object.keys(subAgents).forEach((name) => {
      workflow.addNode(name, subAgents[name].node)
        .addEdge(name, "agent")
    })
  }
  tools.forEach((tool) => {
    const name = tool.name
    workflow.addNode(name, new ToolNode([tool]))
      .addEdge(name, "agent")
  })

  return workflow.compile({
    checkpointer: checkpointSaver,
    interruptBefore,
    interruptAfter,
  });
}

function _createModelWrapper(
  modelWithTools: RunnableInterface<
    BaseLanguageModelInput,
    BaseMessageChunk,
    BaseLanguageModelCallOptions
  >,
  messageModifier?:
    | SystemMessage
    | string
    | ((state: AgentState) => BaseMessage[])
    | ((state: AgentState) => Promise<BaseMessage[]>)
    | Runnable
) {
  if (!messageModifier) {
    return modelWithTools;
  }
  const endict = new RunnableLambda({
    func: (state: AgentState) => (state),
  });
  if (typeof messageModifier === "string") {
    const systemMessage = new SystemMessage(messageModifier);
    const prompt = ChatPromptTemplate.fromMessages([
      systemMessage,
      ["placeholder", "{messages}"],
    ]);
    return endict.pipe(prompt).pipe(modelWithTools);
  }
  if (typeof messageModifier === "function") {
    const lambda = new RunnableLambda({ func: messageModifier }).withConfig({
      runName: "message_modifier",
    });
    return lambda.pipe(modelWithTools);
  }
  if (Runnable.isRunnable(messageModifier)) {
    return messageModifier.pipe(modelWithTools);
  }
  if (messageModifier._getType() === "system") {
    const prompt = ChatPromptTemplate.fromMessages([
      messageModifier,
      ["placeholder", "{messages}"],
    ]);
    return endict.pipe(prompt).pipe(modelWithTools);
  }
  throw new Error(
    `Unsupported message modifier type: ${typeof messageModifier}`
  );
}
