/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  Runtime as LangGraphRuntime,
  PregelOptions,
  StreamMode,
} from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import { TSandboxConfigurable } from "@metad/contracts";


/**
 * Type for the agent's built-in state properties.
 */
export type AgentBuiltInState = {
  /**
   * Array of messages representing the conversation history.
   *
   * This includes all messages exchanged during the agent's execution:
   * - Human messages: Input from the user
   * - AI messages: Responses from the language model
   * - Tool messages: Results from tool executions
   * - System messages: System-level instructions or information
   *
   * Messages are accumulated throughout the agent's lifecycle and can be
   * accessed or modified by middleware hooks during execution.
   */
  messages: BaseMessage[];
  /**
   * Structured response data returned by the agent when a `responseFormat` is configured.
   *
   * This property is only populated when you provide a `responseFormat` schema
   * (as Zod or JSON schema) to the agent configuration. The agent will format
   * its final output to match the specified schema and store it in this property.
   *
   * Note: The type is specified as `Record<string, unknown>` because TypeScript cannot
   * infer the actual response format type in contexts like middleware, where the agent's
   * generic type parameters are not accessible. You may need to cast this to your specific
   * response type when accessing it.
   */
  structuredResponse?: Record<string, unknown>;
};

/**
 * Type helper to check if TContext is an optional Zod schema
 */
type IsOptionalZodObject<T> = T extends any ? true : false;
type IsDefaultZodObject<T> = T extends any ? true : false;

export type WithMaybeContext<TContext> = undefined extends TContext
  ? { readonly context?: TContext }
  : IsOptionalZodObject<TContext> extends true
  ? { readonly context?: TContext }
  : IsDefaultZodObject<TContext> extends true
  ? { readonly context?: TContext }
  : { readonly context: TContext };

/**
 * Runtime information available to middleware (readonly).
 */
export type Runtime<TContext = unknown> = Partial<
  Omit<LangGraphRuntime<TContext>, "context" | "configurable">
> &
  WithMaybeContext<TContext> & {
    configurable?: {
      thread_id?: string;
      sandbox?: TSandboxConfigurable | null;
      [key: string]: unknown;
    };
  };