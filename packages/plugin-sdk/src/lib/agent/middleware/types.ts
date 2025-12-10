import { LanguageModelLike } from '@langchain/core/language_models/base';
import { AIMessage, BaseMessage, SystemMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { InteropZodObject } from '@langchain/core/utils/types'

/**
 * jump targets (user facing)
 */
export const JUMP_TO_TARGETS = ["model", "tools", "end"] as const;
export type JumpToTarget = (typeof JUMP_TO_TARGETS)[number];


export type PromiseOrValue<T> = T | Promise<T>;

/**
 * Result type for middleware functions.
 */
export type MiddlewareResult<TState> =
  | (TState & {
      jumpTo?: JumpToTarget;
    })
  | void;

/**
 * Handler function type for the beforeAgent hook.
 * Called once at the start of agent invocation before any model calls or tool executions.
 *
 * @param state - The current agent state (includes both middleware state and built-in state)
 * @param runtime - The runtime context containing metadata, signal, writer, interrupt, etc.
 * @returns A middleware result containing partial state updates or undefined to pass through
 */
type BeforeAgentHandler<TSchema, TContext> = (
  state: TSchema,
  runtime: TContext
) => PromiseOrValue<MiddlewareResult<Partial<TSchema>>>;

/**
 * Hook type for the beforeAgent lifecycle event.
 * Can be either a handler function or an object with a handler and optional jump targets.
 * This hook is called once at the start of the agent invocation.
 */
export type BeforeAgentHook<
  TSchema extends InteropZodObject | undefined = undefined,
  TContext = unknown
> =
  | BeforeAgentHandler<TSchema, TContext>
  | {
      hook: BeforeAgentHandler<TSchema, TContext>;
      canJumpTo?: JumpToTarget[];
    };


/**
 * Handler function type for the beforeModel hook.
 * Called before the model is invoked and before the wrapModelCall hook.
 *
 * @param state - The current agent state (includes both middleware state and built-in state)
 * @param runtime - The runtime context containing metadata, signal, writer, interrupt, etc.
 * @returns A middleware result containing partial state updates or undefined to pass through
 */
export type BeforeModelHandler<TSchema, TContext> = (
  state: TSchema,
  runtime: TContext
) => PromiseOrValue<MiddlewareResult<Partial<TSchema>>>;

/**
 * Hook type for the beforeModel lifecycle event.
 * Can be either a handler function or an object with a handler and optional jump targets.
 * This hook is called before each model invocation.
 */
export type BeforeModelHook<
  TSchema extends InteropZodObject | undefined = undefined,
  TContext = unknown
> =
  | BeforeModelHandler<TSchema, TContext>
  | {
      hook: BeforeModelHandler<TSchema, TContext>;
      canJumpTo?: JumpToTarget[];
    };


/**
 * Handler function type for the afterModel hook.
 * Called after the model is invoked and before any tools are called.
 * Allows modifying the agent state after model invocation, e.g., to update tool call parameters.
 *
 * @param state - The current agent state (includes both middleware state and built-in state)
 * @param runtime - The runtime context containing metadata, signal, writer, interrupt, etc.
 * @returns A middleware result containing partial state updates or undefined to pass through
 */
export type AfterModelHandler<TSchema, TContext> = (
  state: TSchema,
  runtime: TContext
) => PromiseOrValue<MiddlewareResult<Partial<TSchema>>>;

/**
 * Hook type for the afterModel lifecycle event.
 * Can be either a handler function or an object with a handler and optional jump targets.
 * This hook is called after each model invocation.
 */
export type AfterModelHook<
  TSchema extends InteropZodObject | undefined = undefined,
  TContext = unknown
> =
  | AfterModelHandler<TSchema, TContext>
  | {
      hook: AfterModelHandler<TSchema, TContext>;
      canJumpTo?: JumpToTarget[];
    };


/**
 * Handler function type for the afterAgent hook.
 * Called once at the end of agent invocation after all model calls and tool executions are complete.
 *
 * @param state - The current agent state (includes both middleware state and built-in state)
 * @param runtime - The runtime context containing metadata, signal, writer, interrupt, etc.
 * @returns A middleware result containing partial state updates or undefined to pass through
 */
type AfterAgentHandler<TSchema, TContext> = (
  state: TSchema,
  runtime: TContext
) => PromiseOrValue<MiddlewareResult<Partial<TSchema>>>;

/**
 * Hook type for the afterAgent lifecycle event.
 * Can be either a handler function or an object with a handler and optional jump targets.
 * This hook is called once at the end of the agent invocation.
 */
export type AfterAgentHook<
  TSchema extends InteropZodObject | undefined = undefined,
  TContext = unknown
> =
  | AfterAgentHandler<TSchema, TContext>
  | {
      hook: AfterAgentHandler<TSchema, TContext>;
      canJumpTo?: JumpToTarget[];
    };

/**
 * Configuration for modifying a model call at runtime.
 * All fields are optional and only provided fields will override defaults.
 *
 * @template TState - The agent's state type, must extend Record<string, unknown>. Defaults to Record<string, unknown>.
 * @template TContext - The runtime context type for accessing metadata and control flow. Defaults to unknown.
 */
export interface ModelRequest<
  TState = any,
  TContext = unknown
> {
  /**
   * The model to use for this step.
   */
  model: LanguageModelLike;
  /**
   * The messages to send to the model.
   */
  messages: BaseMessage[];

  systemMessage?: SystemMessage
}

/**
 * Handler function type for wrapping model calls.
 * Takes a model request and returns the AI message response.
 *
 * @param request - The model request containing model, messages, systemPrompt, tools, state, and runtime
 * @returns The AI message response from the model
 */
export type WrapModelCallHandler<
  TSchema extends InteropZodObject | undefined = undefined,
  TContext = unknown
> = (request: ModelRequest<TSchema, TContext>) => PromiseOrValue<AIMessage>;

/**
 * Wrapper function type for the wrapModelCall hook.
 * Allows middleware to intercept and modify model execution.
 * This enables you to:
 * - Modify the request before calling the model (e.g., change system prompt, add/remove tools)
 * - Handle errors and retry with different parameters
 * - Post-process the response
 * - Implement custom caching, logging, or other cross-cutting concerns
 *
 * @param request - The model request containing all parameters needed for the model call
 * @param handler - The function that invokes the model. Call this with a ModelRequest to get the response
 * @returns The AI message response from the model (or a modified version)
 */
export type WrapModelCallHook<
  TSchema extends InteropZodObject | undefined = undefined,
  TContext = unknown
> = (
  request: ModelRequest<TSchema, TContext>,
  handler: WrapModelCallHandler<TSchema, TContext>
) => PromiseOrValue<AIMessage>;


export interface AgentMiddleware<
  TSchema extends InteropZodObject | undefined = any,
  TContextSchema extends
    | InteropZodObject
    | undefined = any,
  TFullContext = any> {
  /**
   * The name of the middleware.
   */
  name: string;
  /**
   * The schema of the middleware state. Middleware state is persisted between multiple invocations. It can be either:
   * - A Zod object
   * - A Zod optional object
   * - A Zod default object
   * - Undefined
   */
  stateSchema?: TSchema;

  /**
   * The schema of the middleware context. Middleware context is read-only and not persisted between multiple invocations. It can be either:
   * - A Zod object
   * - A Zod optional object
   * - A Zod default object
   * - Undefined
   */
  contextSchema?: TContextSchema;

  tools?: DynamicStructuredTool[]

  beforeAgent?: BeforeAgentHook<TSchema, TFullContext>
  beforeModel?: BeforeModelHook<TSchema, TFullContext>
  afterModel?: AfterModelHook<TSchema, TFullContext>
  afterAgent?: AfterAgentHook<TSchema, TFullContext>

  /**
   * Wraps the model invocation with custom logic. This allows you to:
   * - Modify the request before calling the model
   * - Handle errors and retry with different parameters
   * - Post-process the response
   * - Implement custom caching, logging, or other cross-cutting concerns
   *
   * @param request - The model request containing model, messages, systemPrompt, tools, state, and runtime.
   * @param handler - The function that invokes the model. Call this with a ModelRequest to get the response.
   * @returns The response from the model (or a modified version).
   *
   * @example
   * ```ts
   * wrapModelCall: async (request, handler) => {
   *   // Modify request before calling
   *   const modifiedRequest = { ...request, systemPrompt: "You are helpful" };
   *
   *   try {
   *     // Call the model
   *     return await handler(modifiedRequest);
   *   } catch (error) {
   *     // Handle errors and retry with fallback
   *     const fallbackRequest = { ...request, model: fallbackModel };
   *     return await handler(fallbackRequest);
   *   }
   * }
   * ```
   */
  wrapModelCall?: WrapModelCallHook<TSchema, TFullContext>

  /**
   * Wraps tool execution with custom logic. This allows you to:
   * - Modify tool call parameters before execution
   * - Handle errors and retry with different parameters
   * - Post-process tool results
   * - Implement caching, logging, authentication, or other cross-cutting concerns
   * - Return Command objects for advanced control flow
   *
   * The handler receives a ToolCallRequest containing the tool call, state, and runtime,
   * along with a handler function to execute the actual tool.
   *
   * @param request - The tool call request containing toolCall, state, and runtime.
   * @param handler - The function that executes the tool. Call this with a ToolCallRequest to get the result.
   * @returns The tool result as a ToolMessage or a Command for advanced control flow.
   *
   * @example
   * ```ts
   * wrapToolCall: async (request, handler) => {
   *   console.log(`Calling tool: ${request.tool.name}`);
   *   console.log(`Tool description: ${request.tool.description}`);
   *
   *   try {
   *     // Execute the tool
   *     const result = await handler(request);
   *     console.log(`Tool ${request.tool.name} succeeded`);
   *     return result;
   *   } catch (error) {
   *     console.error(`Tool ${request.tool.name} failed:`, error);
   *     // Could return a custom error message or retry
   *     throw error;
   *   }
   * }
   * ```
   *
   * @example Authentication
   * ```ts
   * wrapToolCall: async (request, handler) => {
   *   // Check if user is authorized for this tool
   *   if (!request.runtime.context.isAuthorized(request.tool.name)) {
   *     return new ToolMessage({
   *       content: "Unauthorized to call this tool",
   *       tool_call_id: request.toolCall.id,
   *     });
   *   }
   *   return handler(request);
   * }
   * ```
   *
   * @example Caching
   * ```ts
   * const cache = new Map();
   * wrapToolCall: async (request, handler) => {
   *   const cacheKey = `${request.tool.name}:${JSON.stringify(request.toolCall.args)}`;
   *   if (cache.has(cacheKey)) {
   *     return cache.get(cacheKey);
   *   }
   *   const result = await handler(request);
   *   cache.set(cacheKey, result);
   *   return result;
   * }
   * ```
   */
  wrapToolCall?: (
    request: ModelRequest<TSchema, TFullContext>,
    handler: WrapModelCallHandler<TSchema, TFullContext>
  ) => PromiseOrValue<AIMessage>;
}
