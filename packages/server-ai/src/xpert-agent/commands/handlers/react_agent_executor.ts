import {
  BaseMessageLike,
  HumanMessage,
  isAIMessage,
  isBaseMessage,
  isHumanMessage,
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
import { AnnotationRoot, StateDefinition, UpdateType } from "@langchain/langgraph/dist/graph";
import { channelName, TMessageChannel, TSummarize } from "@metad/contracts";
import { v4 as uuidv4 } from "uuid";
import { ToolNode } from "./tool_node";
import { AgentStateAnnotation, TGraphTool, TSubAgent } from "./types";


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

export type CreateReactAgentParams<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  A extends AnnotationRoot<any> = AnnotationRoot<any>
> = {
  /** The chat model that can utilize OpenAI-style tool calling. */
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
  stateSchema?: A;
  checkpointSaver?: BaseCheckpointSaver;
  interruptBefore?: N[] | All;
  interruptAfter?: N[] | All;
  store?: BaseStore;
  // state?: typeof AgentStateAnnotation
  tags?: string[]
  subAgents?: Record<string,  TSubAgent>
  tools?: TGraphTool[];
  endNodes?: string[]
  summarize?: TSummarize
  /**
   * Enable summarize a title for initial conversation
   */
  summarizeTitle?: boolean
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
): StateGraph<any, any, UpdateType<any> | Partial<any>, "__start__" | "agent" | string, any, any, StateDefinition> {
  const {
    llm,
    tools,
    subAgents,
    stateModifier,
    stateSchema,
    endNodes,
    tags,
    summarizeTitle
  } = props;
  // const summarize = ensureSummarize(props.summarize)

  const toolClasses: (StructuredToolInterface | DynamicTool | RunnableToolLike)[] = []
  if (tools) {
    toolClasses.push(...tools.map((item) => item.tool))
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
        // if (summarize?.enabled && messages.length > summarize.maxMessages) {
        //   return "summarize_conversation";
        // } else if (!title && summarizeTitle) {
        //   return "title_conversation"
        // }

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

  const workflow = new StateGraph(stateSchema ?? AgentStateAnnotation)
    .addNode(
      "agent",
      new RunnableLambda({ func: callModel }).withConfig({ runName: "agent", tags })
    )
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue,)
  
  // if (summarizeTitle) {
  //   workflow.addNode("title_conversation", createTitleAgent(llm))
  //     .addEdge("title_conversation", END)
  // }

  if (subAgents) {
    Object.keys(subAgents).forEach((name) => {
      workflow.addNode(name, subAgents[name].node)
        .addEdge(name, endNodes?.includes(name) ? END :"agent")
    })
  }
  tools?.forEach(({caller, tool, variables}) => {
    const name = tool.name
    workflow.addNode(name, new ToolNode([tool], {caller, variables}))
      .addEdge(name, endNodes?.includes(tool.name) ? END : "agent")
  })

  // if (summarize?.enabled) {
  //   workflow.addNode("summarize_conversation", createSummarizeAgent(llm, summarize))
  //     .addEdge("summarize_conversation", END)
  // }

  return workflow
  // .compile({
  //   checkpointer: checkpointSaver,
  //   interruptBefore,
  //   interruptAfter,
  //   store
  // });
}

export function createSummarizeAgent(model: BaseChatModel, summarize: TSummarize, agentKey?: string) {
  return async (state: typeof AgentStateAnnotation.State): Promise<Partial<typeof AgentStateAnnotation.State>> => {
    const channel = channelName(agentKey)
    // First, we summarize the conversation
    const summary = (<TMessageChannel>state[channel]).summary
    const messages = (<TMessageChannel>state[channel]).messages
    let summaryMessage: string;
    if (summary) {
      // If a summary already exists, we use a different system prompt
      // to summarize it than if one didn't
      summaryMessage = `This is summary of the conversation to date: ${summary}\n\n` +
        (summarize.prompt ? summarize.prompt : 'Extend the summary by taking into account the new messages above:');
    } else {
      summaryMessage = summarize.prompt ? summarize.prompt : 'Create a summary of the conversation above:'
    }
  
    const allMessages = [...messages, new HumanMessage({
      id: uuidv4(),
      content: summaryMessage,
    })];
    const response = await model.invoke(allMessages, {tags: ['summarize_conversation']});
    // We now need to delete messages that we no longer want to show up
    const summarizedMessages = messages.slice(0, -summarize.retainMessages)
    const retainMessages = messages.slice(-summarize.retainMessages)
    while(!isHumanMessage(retainMessages[0]) && summarizedMessages.length) {
      const lastSummarizedMessage = summarizedMessages.pop()
      retainMessages.unshift(lastSummarizedMessage)
    }
    const deleteMessages = summarizedMessages.map((m) => new RemoveMessage({ id: m.id as string }))
    if (typeof response.content !== "string") {
      throw new Error("Expected a string summary of response from the model");
    }
    return {
      summary: response.content,
      [channel]: {
        summary: response.content,
        messages: deleteMessages
      }
    };
  }
}
