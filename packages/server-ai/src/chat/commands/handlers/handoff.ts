import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import {
  Command,
  MessagesAnnotation,
  getCurrentTaskInput,
} from "@langchain/langgraph";

const WHITESPACE_RE = /\s+/;

export function _normalizeAgentName(agentName: string): string {
  /**
   * Normalize an agent name to be used inside the tool name.
   */
  return agentName.trim().replace(WHITESPACE_RE, "_").toLowerCase();
}

const createHandoffTool = ({ agentName, title, description }: { agentName: string; title: string; description: string; }) => {
  /**
   * Create a tool that can handoff control to the requested agent.
   *
   * @param agentName - The name of the agent to handoff control to, i.e.
   *   the name of the agent node in the multi-agent graph.
   *   Agent names should be simple, clear and unique, preferably in snake_case,
   *   although you are only limited to the names accepted by LangGraph
   *   nodes as well as the tool names accepted by LLM providers
   *   (the tool name will look like this: `transfer_to_<agent_name>`).
   */
  const toolName = `transfer_to_${_normalizeAgentName(agentName)}`;
  let toolDescription = `Ask expert "${agentName}" for help.`
  if (title) {
    toolDescription += ` He is "${title}".`;
  }
  if (description) {
    toolDescription += ` He is described as "${description}".`;
  }
  const handoffTool = tool(
    async (_, config) => {
      /**
       * Ask another agent for help.
       */
      const toolMessage = new ToolMessage({
        content: `Successfully transferred to ${agentName}`,
        name: toolName,
        tool_call_id: config.toolCall.id,
      });

      // inject the current agent state
      const state =
        getCurrentTaskInput() as (typeof MessagesAnnotation)["State"];
      return new Command({
        goto: agentName,
        // graph: Command.PARENT,
        update: { messages: state.messages.concat(toolMessage) },
      });
    },
    {
      name: toolName,
      schema: z.object({
        input: z.string().describe(`Requirement`)
      }),
      description: toolDescription,
    }
  );
  return handoffTool;
};

function createHandoffBackMessages(
  agentName: string,
  supervisorName: string
): [AIMessage, ToolMessage] {
  /**
   * Create a pair of (AIMessage, ToolMessage) to add to the message history when returning control to the supervisor.
   */
  const toolCallId = uuidv4();
  const toolName = `transfer_back_to_${_normalizeAgentName(supervisorName)}`;
  const toolCalls = [{ name: toolName, args: {}, id: toolCallId }];

  return [
    new AIMessage({
      content: `Transferring back to ${supervisorName}`,
      tool_calls: toolCalls,
      name: agentName,
    }),
    new ToolMessage({
      content: `Successfully transferred back to ${supervisorName}`,
      name: toolName,
      tool_call_id: toolCallId,
    }),
  ];
}

export { createHandoffTool, createHandoffBackMessages };
