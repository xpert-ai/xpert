import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { CommandBus } from "@nestjs/cqrs";
import {
  Command,
  MessagesAnnotation,
  getCurrentTaskInput,
} from "@langchain/langgraph";
import { XpertProjectTaskService } from "../services/project-task.service";


export const createListTasksTool = ({ projectId, service }: { projectId: string; service: XpertProjectTaskService }) => {
    const listTasksTool = tool(
        async (_, config) => {

            return await service.findAll({ where: { projectId } })
        },
        {
          name: `project_list_tasks`,
          schema: z.object({}),
          description: "List all task in project.",
        }
      );
      return listTasksTool;
}