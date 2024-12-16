import {
  BaseMessageLike,
  HumanMessage,
  isAIMessage,
  isBaseMessage,
  RemoveMessage,
  SystemMessage,
} from "@langchain/core/messages";
import {
  Runnable,
  RunnableConfig,
  RunnableInterface,
  RunnableLambda,
  RunnableToolLike,
} from "@langchain/core/runnables";
import { DynamicTool, StructuredToolInterface } from "@langchain/core/tools";
import { BaseCheckpointSaver, BaseStore, CompiledStateGraph, END, LangGraphRunnableConfig, MessagesAnnotation, Send, START, StateGraph } from "@langchain/langgraph";
import { All } from "@langchain/langgraph-checkpoint";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { v4 as uuidv4 } from "uuid";
import z from 'zod'
import { ToolNode } from "./tool_node";
import { AgentStateAnnotation, TSubAgent } from "./types";
import { TLongTermMemory, TSummarize } from "@metad/contracts";


function _getStateModifierRunnable(
  stateModifier: StateModifier | undefined
): RunnableInterface {
  let stateModifierRunnable: RunnableInterface;

  if (stateModifier == null) {
    stateModifierRunnable = RunnableLambda.from(
      (state: typeof MessagesAnnotation.State) => state.messages
    ).withConfig({ runName: "state_modifier" });
  } else if (typeof stateModifier === "string") {
    const systemMessage = new SystemMessage(stateModifier);
    stateModifierRunnable = RunnableLambda.from(
      (state: typeof MessagesAnnotation.State) => {
        return [systemMessage, ...(state.messages ?? [])];
      }
    ).withConfig({ runName: "state_modifier" });
  } else if (
    isBaseMessage(stateModifier) &&
    stateModifier._getType() === "system"
  ) {
    stateModifierRunnable = RunnableLambda.from(
      (state: typeof MessagesAnnotation.State) => [
        stateModifier,
        ...state.messages,
      ]
    ).withConfig({ runName: "state_modifier" });
  } else if (typeof stateModifier === "function") {
    stateModifierRunnable = RunnableLambda.from(stateModifier).withConfig({
      runName: "state_modifier",
    });
  } else if (Runnable.isRunnable(stateModifier)) {
    stateModifierRunnable = stateModifier;
  } else {
    throw new Error(
      `Got unexpected type for 'stateModifier': ${typeof stateModifier}`
    );
  }

  return stateModifierRunnable;
}


type AgentState = typeof AgentStateAnnotation.State

export type N = any

export type StateModifier =
  | SystemMessage
  | string
  | ((
      state: typeof MessagesAnnotation.State,
      config: LangGraphRunnableConfig
    ) => BaseMessageLike[])
  | ((
      state: typeof MessagesAnnotation.State,
      config: LangGraphRunnableConfig
    ) => Promise<BaseMessageLike[]>)
  | Runnable;

export type CreateReactAgentParams = {
  llm: BaseChatModel;
  /**
   * An optional state modifier. This takes full graph state BEFORE the LLM is called and prepares the input to LLM.
   *
   * Can take a few different forms:
   *
   * - SystemMessage: this is added to the beginning of the list of messages in state["messages"].
   * - str: This is converted to a SystemMessage and added to the beginning of the list of messages in state["messages"].
   * - Function: This function should take in full graph state and the output is then passed to the language model.
   * - Runnable: This runnable should take in full graph state and the output is then passed to the language model.
   */
  stateModifier?: StateModifier;
  checkpointSaver?: BaseCheckpointSaver;
  interruptBefore?: N[] | All;
  interruptAfter?: N[] | All;
  store?: BaseStore;
  state?: typeof AgentStateAnnotation
  tags?: string[]
  subAgents?: Record<string,  TSubAgent>
  tools?: (StructuredToolInterface | RunnableToolLike)[];
  summarize?: TSummarize
  memory?: TLongTermMemory
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
    stateModifier,
    checkpointSaver,
    interruptBefore,
    interruptAfter,
    state,
    tags,
    store,
    memory
  } = props;
  const summarize = ensureSummarize(props.summarize)

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
  // we're passing store here for validation
  const preprocessor = _getStateModifierRunnable(stateModifier,);
  const modelRunnable = (preprocessor as Runnable).pipe(modelWithTools);

  const shouldContinue = (state: AgentState) => {
    const { title, messages } = state;
    const lastMessage = messages[messages.length - 1];
    if (isAIMessage(lastMessage)) {
      if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {

        // If there are more than six messages, then we summarize the conversation
        if (summarize?.enabled && messages.length > summarize.maxMessages) {
          return "summarize_conversation";
        } else if (!title) {
          return "title_conversation"
        }

        return END;
      }

      return lastMessage.tool_calls.map((toolCall) => new Send(toolCall.name, { ...state, toolCall }) )
    }

    return END;
  };

  const callModel = async (state: AgentState, config?: RunnableConfig) => {
    // TODO: Auto-promote streaming.
    return { messages: [await modelRunnable.invoke(state, config)] };
  };

  const workflow = new StateGraph(state ?? AgentStateAnnotation)
    .addNode(
      "agent",
      new RunnableLambda({ func: callModel }).withConfig({ runName: "agent", tags })
    )
    .addNode("title_conversation", createTitleAgent(llm))
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue,)
    .addEdge("title_conversation", END)

  if (subAgents) {
    Object.keys(subAgents).forEach((name) => {
      workflow.addNode(name, subAgents[name].node)
        .addEdge(name, "agent")
    })
  }
  tools?.forEach((tool) => {
    const name = tool.name
    workflow.addNode(name, new ToolNode([tool]))
      .addEdge(name, "agent")
  })

  if (summarize?.enabled) {
    workflow.addNode("summarize_conversation", createSummarizeAgent(llm, summarize))
      .addEdge("summarize_conversation", END)
  }

  return workflow.compile({
    checkpointer: checkpointSaver,
    interruptBefore,
    interruptAfter,
    store
  });
}

export function createSummarizeAgent(model: BaseChatModel, summarize: TSummarize) {
  return async (state: typeof AgentStateAnnotation.State): Promise<any> => {
    // First, we summarize the conversation
    const { summary, messages } = state;
    let summaryMessage: string;
    if (summary) {
      // If a summary already exists, we use a different system prompt
      // to summarize it than if one didn't
      summaryMessage = `This is summary of the conversation to date: ${summary}\n\n` +
        (summarize.prompt ? `${summarize.prompt}\n` : '')
        "Extend the summary by taking into account the new messages above:";
    } else {
      summaryMessage = (summarize.prompt ? `${summarize.prompt}\n` : '') + "Create a summary of the conversation above:";
    }
  
    const allMessages = [...messages, new HumanMessage({
      id: uuidv4(),
      content: summaryMessage,
    })];
    const response = await model.invoke(allMessages);
    // We now need to delete messages that we no longer want to show up
    // I will delete all but the last two messages, but you can change this
    const deleteMessages = messages.slice(0, -summarize.retainMessages).map((m) => new RemoveMessage({ id: m.id as string }));
    if (typeof response.content !== "string") {
      throw new Error("Expected a string summary of response from the model");
    }
    return { summary: response.content, messages: deleteMessages };
  }
}

export function createTitleAgent(model: BaseChatModel) {
  return async (state: typeof AgentStateAnnotation.State): Promise<any> => {
    // First, we title the conversation
    const { messages } = state;
  
    const allMessages = [...messages, new HumanMessage({
      id: uuidv4(),
      content: "Create a short title of the conversation above:",
    })];
    const response = await model.invoke(allMessages);
    if (typeof response.content !== "string") {
      throw new Error("Expected a string response from the model");
    }
    return { title: response.content };
  }
}

function ensureSummarize(summarize?: TSummarize) {
  return summarize && {
    ...summarize,
    maxMessages: summarize.maxMessages ?? 100,
    retainMessages: summarize.retainMessages ?? 90
  }
}