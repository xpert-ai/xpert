

import { BaseStore, LangGraphRunnableConfig } from "@langchain/langgraph";
import { v4 as uuidv4 } from "uuid";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatMessageEventTypeEnum, ChatMessageStepCategory, ChatMessageStepType, LongTermMemoryTypeEnum, TChatMessageStep } from "@metad/contracts";
import { Logger } from "@nestjs/common";
import { formatMemories } from "./utils";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";

export function ensureConfiguration(config?: LangGraphRunnableConfig) {
  const configurable = config?.configurable || {};
  return {
    userId: configurable?.userId || "default",
  };
}

/**
 * Get the store from the configuration or throw an error.
 */
export function getStoreFromConfigOrThrow(
  config: LangGraphRunnableConfig,
): BaseStore {
  if (!config.store) {
    throw new Error("Store not found in configuration");
  }

  return config.store;
}

/**
 * Initialize tools within a function so that they have access to the current
 * state and config at runtime.
 */
export function initializeMemoryTools(store: BaseStore, xpertId: string) {
  const logger = new Logger(`searchRecallMemories`)
  /**
   * Search recall memories in the database.
   * @param content The main content of the memory.
   * @param context Additional context for the memory.
   * @param memoryId Optional ID to overwrite an existing memory.
   * @returns A string confirming the memory storage.
   */
  async function searchRecallMemories(opts: {query: string;}) {
    const { query } = opts;
    const items = await store.search([xpertId, LongTermMemoryTypeEnum.QA], {query: query})

    if (items.length > 0) {
      // Step tool message
      dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
        type: ChatMessageStepType.Notice,
        category: ChatMessageStepCategory.Memory,
        toolset: `memories`,
        tool: `search_recall_memories`,
        message: `Recall memories`,
        title: `Recall memories`,
        data: items
      } as TChatMessageStep).catch((err) => {
        logger.error(err)
      })
    }

    return [formatMemories(items), items]
  }

  const searchRecallMemoriesTool = tool(searchRecallMemories, {
    name: "search_recall_memories",
    description: "Search for best practices in relevant memories to solve user problems.",
    schema: z.object({
      query: z.string().describe("The question to search for relevant memories."),
    }),
    responseFormat: 'content_and_artifact'
  });

  return [searchRecallMemoriesTool];
}