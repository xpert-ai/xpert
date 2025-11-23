import { ChatPromptTemplate } from '@langchain/core/prompts'
import { RunnableConfig, RunnableLambda } from '@langchain/core/runnables'
import { END, START, StateGraph, StateGraphArgs } from '@langchain/langgraph/web'
import { AgentState, createCopilotAgentState, CreateGraphOptions } from '@metad/copilot'

const state: StateGraphArgs<AgentState>['channels'] = createCopilotAgentState()

/**
 * @deprecated use ChatKit instead
 */
export function injectCreateChatAgent() {
  return async ({ llm, checkpointer, interruptBefore, interruptAfter }: CreateGraphOptions) => {
    const prompt = ChatPromptTemplate.fromMessages(
      [
        ['system', '{{role}}\n{{language}}\n{{context}}'],
        ['placeholder', '{messages}']
      ],
      { templateFormat: 'mustache' }
    )

    const callModel = async (state: AgentState, config: RunnableConfig) => {
      // console.log(`call Model in free graph:`, state.messages)
      // TODO: Auto-promote streaming.
      return { messages: [await prompt.pipe(llm).invoke(state, { signal: config.signal })] }
    }
    const workflow = new StateGraph<AgentState>({
      channels: state
    })
      .addNode('agent', new RunnableLambda({ func: callModel }).withConfig({ runName: 'agent' }))
      .addEdge('agent', END)
      .addEdge(START, 'agent')

    return workflow.compile({
      checkpointer,
      interruptBefore,
      interruptAfter
    })
  }
}
