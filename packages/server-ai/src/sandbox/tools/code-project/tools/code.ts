import { tool } from "@langchain/core/tools";
import { Command, getCurrentTaskInput } from "@langchain/langgraph";
import { STATE_VARIABLE_FILES } from "@metad/contracts";
import { ToolMessage } from "@langchain/core/messages";
import z from 'zod';
import { CodeProjectToolEnum } from "../types";
import { AgentStateAnnotation } from "../../../../shared";

export const createCodeTool = () => {

    const toolName = CodeProjectToolEnum.Code;
  
    const codeTool = tool(
        async (_, config) => {
            console.log(_)
            const currentState = getCurrentTaskInput<typeof AgentStateAnnotation.State>()
            const toolCallId = config.metadata.tool_call_id

            return new Command({
                update: {
                    [STATE_VARIABLE_FILES]: [
                      _
                    ],
                    messages: [
                      new ToolMessage({
                        name: toolName,
                        content: 'File has been created!',
                        tool_call_id: toolCallId
                      })
                    ]
                },
               
            })
        },
      {
          name: toolName,
          schema: z.object({
              filename: z.string(),
              type: z.enum(['jsx']).describe('Which type of code file'),
              content: z.string().describe('The content of code file'),
              language: z.string().optional(), // 可选
          }),
          description: "Create a code file.",
      }
    );
    return codeTool;
};