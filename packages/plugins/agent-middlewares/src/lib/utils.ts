import { BaseMessage, isAIMessage, isToolMessage } from "@langchain/core/messages";

/**
 * Default token counter that approximates based on character count
 * @param messages Messages to count tokens for
 * @returns Approximate token count
 */
export function countTokensApproximately(messages: BaseMessage[]): number {
  let totalChars = 0;
  for (const msg of messages) {
    let textContent: string;
    if (typeof msg.content === "string") {
      textContent = msg.content;
    } else if (Array.isArray(msg.content)) {
      textContent = msg.content
        .map((item) => {
          if (typeof item === "string") return item;
          if (item.type === "text" && "text" in item) return item.text;
          return "";
        })
        .join("");
    } else {
      textContent = "";
    }

    if (
      isAIMessage(msg) &&
      Array.isArray(msg.tool_calls) &&
      msg.tool_calls.length > 0
    ) {
      textContent += JSON.stringify(msg.tool_calls);
    }

    if (isToolMessage(msg)) {
      textContent += msg.tool_call_id ?? "";
    }

    totalChars += textContent.length;
  }
  // Approximate 1 token = 4 characters
  return Math.ceil(totalChars / 4);
}

/**
 * Check if the last message in the messages array has tool calls.
 *
 * @param messages - The messages to check.
 * @returns True if the last message has tool calls, false otherwise.
 */
export function hasToolCalls(message?: BaseMessage): boolean {
  return Boolean(
    isAIMessage(message) &&
      message.tool_calls &&
      message.tool_calls.length > 0
  );
}