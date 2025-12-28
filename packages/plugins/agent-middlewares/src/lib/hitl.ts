import { ToolCall } from '@langchain/core/messages/tool'
import { InferInteropZodInput, interopParse } from '@langchain/core/utils/types'
import { interrupt, Runtime } from '@langchain/langgraph'
import { AIMessage, isAIMessage, ToolMessage } from '@langchain/core/messages'
import { TAgentMiddlewareMeta } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentBuiltInState,
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  JumpToTarget,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'

const DescriptionFunctionSchema = z
  .function()
  .args(
    z.custom<ToolCall>(), // toolCall
    z.custom<AgentBuiltInState>(), // state
    z.custom<Runtime<unknown>>() // runtime
  )
  .returns(z.union([z.string(), z.promise(z.string())]))

/**
 * Function type that dynamically generates a description for a tool call approval request.
 *
 * @param toolCall - The tool call being reviewed
 * @param state - The current agent state
 * @param runtime - The agent runtime context
 * @returns A string description or Promise that resolves to a string description
 *
 * @example
 * ```typescript
 * import { type DescriptionFactory, type ToolCall } from "langchain";
 *
 * const descriptionFactory: DescriptionFactory = (toolCall, state, runtime) => {
 *   return `Please review: ${toolCall.name}(${JSON.stringify(toolCall.args)})`;
 * };
 * ```
 */
export type DescriptionFactory = z.infer<typeof DescriptionFunctionSchema>

/**
 * The type of decision a human can make.
 */
const ALLOWED_DECISIONS = ['approve', 'edit', 'reject'] as const
const DecisionType = z.enum(ALLOWED_DECISIONS)
export type DecisionType = z.infer<typeof DecisionType>

const InterruptOnConfigSchema = z.object({
  /**
   * The decisions that are allowed for this action.
   */
  allowedDecisions: z.array(DecisionType),
  /**
   * The description attached to the request for human input.
   * Can be either:
   * - A static string describing the approval request
   * - A callable that dynamically generates the description based on agent state,
   *   runtime, and tool call information
   *
   * @example
   * Static string description
   * ```typescript
   * import type { InterruptOnConfig } from "langchain";
   *
   * const config: InterruptOnConfig = {
   *   allowedDecisions: ["approve", "reject"],
   *   description: "Please review this tool execution"
   * };
   * ```
   *
   * @example
   * Dynamic callable description
   * ```typescript
   * import type {
   *   AgentBuiltInState,
   *   Runtime,
   *   DescriptionFactory,
   *   ToolCall,
   *   InterruptOnConfig
   * } from "langchain";
   *
   * const formatToolDescription: DescriptionFactory = (
   *   toolCall: ToolCall,
   *   state: AgentBuiltInState,
   *   runtime: Runtime<unknown>
   * ) => {
   *   return `Tool: ${toolCall.name}\nArguments:\n${JSON.stringify(toolCall.args, null, 2)}`;
   * };
   *
   * const config: InterruptOnConfig = {
   *   allowedDecisions: ["approve", "edit"],
   *   description: formatToolDescription
   * };
   * ```
   */
  description: z.union([z.string(), DescriptionFunctionSchema]).optional(),
  /**
   * JSON schema for the arguments associated with the action, if edits are allowed.
   */
  argsSchema: z.record(z.any()).optional()
})
export type InterruptOnConfig = z.input<typeof InterruptOnConfigSchema>

/**
 * Represents an action with a name and arguments.
 */
export interface Action {
  /**
   * The type or name of action being requested (e.g., "add_numbers").
   */
  name: string
  /**
   * Key-value pairs of arguments needed for the action (e.g., {"a": 1, "b": 2}).
   */
  args: Record<string, any>
}

/**
 * Represents an action request with a name, arguments, and description.
 */
export interface ActionRequest {
  /**
   * The name of the action being requested.
   */
  name: string
  /**
   * Key-value pairs of arguments needed for the action (e.g., {"a": 1, "b": 2}).
   */
  args: Record<string, any>
  /**
   * The description of the action to be reviewed.
   */
  description?: string
}

/**
 * Policy for reviewing a HITL request.
 */
export interface ReviewConfig {
  /**
   * Name of the action associated with this review configuration.
   */
  actionName: string
  /**
   * The decisions that are allowed for this request.
   */
  allowedDecisions: DecisionType[]
  /**
   * JSON schema for the arguments associated with the action, if edits are allowed.
   */
  argsSchema?: Record<string, any>
}

/**
 * Request for human feedback on a sequence of actions requested by a model.
 *
 * @example
 * ```ts
 * const hitlRequest: HITLRequest = {
 *   actionRequests: [
 *     { name: "send_email", args: { to: "user@example.com", subject: "Hello" } }
 *   ],
 *   reviewConfigs: [
 *     {
 *       actionName: "send_email",
 *       allowedDecisions: ["approve", "edit", "reject"],
 *       description: "Please review the email before sending"
 *     }
 *   ]
 * };
 * const response = interrupt(hitlRequest);
 * ```
 */
export interface HITLRequest {
  /**
   * A list of agent actions for human review.
   */
  actionRequests: ActionRequest[]
  /**
   * Review configuration for all possible actions.
   */
  reviewConfigs: ReviewConfig[]
}

/**
 * Response when a human approves the action.
 */
export interface ApproveDecision {
  type: 'approve'
}

/**
 * Response when a human edits the action.
 */
export interface EditDecision {
  type: 'edit'
  /**
   * Edited action for the agent to perform.
   * Ex: for a tool call, a human reviewer can edit the tool name and args.
   */
  editedAction: Action
}

/**
 * Response when a human rejects the action.
 */
export interface RejectDecision {
  type: 'reject'
  /**
   * The message sent to the model explaining why the action was rejected.
   */
  message?: string
}

/**
 * Union of all possible decision types.
 */
export type Decision = ApproveDecision | EditDecision | RejectDecision

/**
 * Response payload for a HITLRequest.
 */
export interface HITLResponse {
  /**
   * The decisions made by the human.
   */
  decisions: Decision[]
}

const contextSchema = z.object({
  /**
   * Mapping of tool name to allowed reviewer responses.
   * If a tool doesn't have an entry, it's auto-approved by default.
   *
   * - `true` -> pause for approval and allow approve/edit/reject decisions
   * - `false` -> auto-approve (no human review)
   * - `InterruptOnConfig` -> explicitly specify which decisions are allowed for this tool
   */
  interruptOn: z.record(z.union([z.boolean(), InterruptOnConfigSchema])).optional(),
  /**
   * Prefix used when constructing human-facing approval messages.
   * Provides context about the tool call being reviewed; does not change the underlying action.
   *
   * Note: This prefix is only applied for tools that do not provide a custom
   * `description` via their {@link InterruptOnConfig}. If a tool specifies a custom
   * `description`, that per-tool text is used and this prefix is ignored.
   */
  descriptionPrefix: z.string().default('Tool execution requires approval')
})
export type HumanInTheLoopMiddlewareConfig = InferInteropZodInput<typeof contextSchema>

const HUMANINTHELOOP_MIDDLEWARE_NAME = 'HumanInTheLoopMiddleware'

@Injectable()
@AgentMiddlewareStrategy(HUMANINTHELOOP_MIDDLEWARE_NAME)
export class HumanInTheLoopMiddleware implements IAgentMiddlewareStrategy {
  meta: TAgentMiddlewareMeta = {
    name: HUMANINTHELOOP_MIDDLEWARE_NAME,
    label: {
      en_US: 'Human-in-the-Loop (HITL) Middleware',
      zh_Hans: '人机协同中间件'
    },
    description: {
      en_US: 'Lets you add human oversight to agent tool calls. When a model proposes an action that might require review — for example, writing to a file or executing SQL — the middleware can pause execution and wait for a decision.',
      zh_Hans: '允许您在智能体工具调用中添加人工监督。当模型提出可能需要审核的操作（例如，写入文件或执行 SQL）时，中间件可以暂停执行并等待决策。'
    },
    icon: {
      type: 'svg',
      value: `<?xml version="1.0" encoding="utf-8"?>
<svg width="800px" height="800px" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12.2926 2.29317C12.683 1.90249 13.3162 1.90225 13.7068 2.29262L16.7115 5.29492C16.8993 5.48257 17.0047 5.7372 17.0046 6.00269C17.0045 6.26817 16.8989 6.52272 16.7109 6.71023L13.7063 9.70792C13.3153 10.098 12.6821 10.0973 12.2921 9.70629C11.902 9.31531 11.9027 8.68215 12.2937 8.29208L13.5785 7.01027C9.07988 7.22996 5.5 10.9469 5.5 15.5C5.5 20.1944 9.30558 24 14 24C18.5429 24 22.254 20.4356 22.4882 15.9515C22.517 15.3999 22.9875 14.9762 23.539 15.005C24.0906 15.0338 24.5143 15.5043 24.4855 16.0558C24.1961 21.5969 19.6126 26 14 26C8.20101 26 3.5 21.299 3.5 15.5C3.5 9.8368 7.98343 5.22075 13.5945 5.00769L12.2932 3.70738C11.9025 3.31701 11.9023 2.68384 12.2926 2.29317Z" fill="currentColor"/>
<path d="M18.2071 12.2929C18.5976 12.6834 18.5976 13.3166 18.2071 13.7071L13.2071 18.7071C13.0196 18.8946 12.7652 19 12.5 19C12.2348 19 11.9804 18.8946 11.7929 18.7071L9.79289 16.7071C9.40237 16.3166 9.40237 15.6834 9.79289 15.2929C10.1834 14.9024 10.8166 14.9024 11.2071 15.2929L12.5 16.5858L16.7929 12.2929C17.1834 11.9024 17.8166 11.9024 18.2071 12.2929Z" fill="currentColor"/>
</svg>`,
      color: 'green'
    },
    configSchema: {
      type: 'object',
      properties: {
        interruptOn: {
          type: 'object',
          title: {
            en_US: 'Interrupt On',
            zh_Hans: '中断于'
          },
          description: {
            en_US: 'Mapping of tool name to allowed reviewer responses. If a tool does not have an entry, it is auto-approved by default.',
            zh_Hans: '工具名称到允许的审核者响应的映射。如果工具没有条目，则默认情况下会自动批准。'
          },
          'x-ui': {
            component: 'agent-interrupt-on',
            span: 2
          }
        },
        descriptionPrefix: {
          type: 'string',
          title: {
            en_US: 'Description Prefix',
            zh_Hans: '描述前缀'
          },
          description: {
            en_US: 'Prefix used when constructing human-facing approval messages. Provides context about the tool call being reviewed; does not change the underlying action.',
            zh_Hans: '用于构建面向人类的审批消息的前缀。提供有关正在审核的工具调用的上下文；不会更改基础操作。'
          },
          'x-ui': {
            component: 'textarea',
            span: 2
          }
        }
      }
    }
  }
  
  createMiddleware(
    options: NonNullable<HumanInTheLoopMiddlewareConfig>,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {

    const createActionAndConfig = async (
      toolCall: ToolCall,
      config: InterruptOnConfig,
      state: AgentBuiltInState,
      runtime: Runtime<unknown>
    ): Promise<{
      actionRequest: ActionRequest;
      reviewConfig: ReviewConfig;
    }> => {
      const toolName = toolCall.name;
      const toolArgs = toolCall.args;

      // Generate description using the description field (str or callable)
      const descriptionValue = config.description;
      let description: string;
      if (typeof descriptionValue === "function") {
        description = await descriptionValue(toolCall, state, runtime);
      } else if (descriptionValue !== undefined) {
        description = descriptionValue;
      } else {
        description = `${
          options.descriptionPrefix ?? "Tool execution requires approval"
        }\n\nTool: ${toolName}\nArgs: ${JSON.stringify(toolArgs, null, 2)}`;
      }

      /**
       * Create ActionRequest with description
       */
      const actionRequest: ActionRequest = {
        name: toolName,
        args: toolArgs,
        description,
      };

      /**
       * Create ReviewConfig
       */
      const reviewConfig: ReviewConfig = {
        actionName: toolName,
        allowedDecisions: config.allowedDecisions,
      };

      if (config.argsSchema) {
        reviewConfig.argsSchema = config.argsSchema;
      }

      return { actionRequest, reviewConfig };
    };

    const processDecision = (
      decision: Decision,
      toolCall: ToolCall,
      config: InterruptOnConfig
    ): { revisedToolCall: ToolCall | null; toolMessage: ToolMessage | null } => {
      const allowedDecisions = config.allowedDecisions;
      if (decision.type === "approve" && allowedDecisions.includes("approve")) {
        return { revisedToolCall: toolCall, toolMessage: null };
      }

      if (decision.type === "edit" && allowedDecisions.includes("edit")) {
        const editedAction = decision.editedAction;

        /**
         * Validate edited action structure
         */
        if (!editedAction || typeof editedAction.name !== "string") {
          throw new Error(
            `Invalid edited action for tool "${toolCall.name}": name must be a string`
          );
        }
        if (!editedAction.args || typeof editedAction.args !== "object") {
          throw new Error(
            `Invalid edited action for tool "${toolCall.name}": args must be an object`
          );
        }

        return {
          revisedToolCall: {
            type: "tool_call",
            name: editedAction.name,
            args: editedAction.args,
            id: toolCall.id,
          },
          toolMessage: null,
        };
      }

      if (decision.type === "reject" && allowedDecisions.includes("reject")) {
        /**
         * Validate that message is a string if provided
         */
        if (
          decision.message !== undefined &&
          typeof decision.message !== "string"
        ) {
          throw new Error(
            `Tool call response for "${
              toolCall.name
            }" must be a string, got ${typeof decision.message}`
          );
        }

        // Create a tool message with the human's text response
        const content =
          decision.message ??
          `User rejected the tool call for \`${toolCall.name}\` with id ${toolCall.id}`;

        const toolMessage = new ToolMessage({
          content,
          name: toolCall.name,
          tool_call_id: toolCall.id!,
          status: "error",
        });

        return { revisedToolCall: toolCall, toolMessage };
      }

      const msg = `Unexpected human decision: ${JSON.stringify(
        decision
      )}. Decision type '${decision.type}' is not allowed for tool '${
        toolCall.name
      }'. Expected one of ${JSON.stringify(
        allowedDecisions
      )} based on the tool's configuration.`;
      throw new Error(msg);
    };

    return {
      name: HUMANINTHELOOP_MIDDLEWARE_NAME,
      contextSchema,
      afterModel: {
        canJumpTo: ['model'],
        hook: async (state, runtime) => {
          const config = interopParse(contextSchema, {
            ...options,
            ...(runtime.context || {})
          })
          if (!config) {
            return
          }

          const { messages } = state
          if (!messages.length) {
            return
          }

          /**
           * Don't do anything if the last message isn't an AI message with tool calls.
           */
          const lastMessage = [...messages].reverse().find((msg) => isAIMessage(msg)) as AIMessage
          if (!lastMessage || !lastMessage.tool_calls?.length) {
            return
          }

          /**
           * If the user omits the interruptOn config, we don't do anything.
           */
          if (!config.interruptOn) {
            return;
          }

          /**
           * Resolve per-tool configs (boolean true -> all decisions allowed; false -> auto-approve)
           */
          const resolvedConfigs: Record<string, InterruptOnConfig> = {};
          for (const [toolName, toolConfig] of Object.entries(
            config.interruptOn
          )) {
            if (typeof toolConfig === "boolean") {
              if (toolConfig === true) {
                resolvedConfigs[toolName] = {
                  allowedDecisions: [...ALLOWED_DECISIONS],
                };
              }
            } else if (toolConfig.allowedDecisions) {
              resolvedConfigs[toolName] = toolConfig as InterruptOnConfig;
            }
          }

          const interruptToolCalls: ToolCall[] = [];
          const autoApprovedToolCalls: ToolCall[] = [];

          for (const toolCall of lastMessage.tool_calls) {
            if (toolCall.name in resolvedConfigs) {
              interruptToolCalls.push(toolCall);
            } else {
              autoApprovedToolCalls.push(toolCall);
            }
          }

          /**
           * No interrupt tool calls, so we can just return.
           */
          if (!interruptToolCalls.length) {
            return;
          }

          /**
           * Create action requests and review configs for all tools that need approval
           */
          const actionRequests: ActionRequest[] = [];
          const reviewConfigs: ReviewConfig[] = [];

          for (const toolCall of interruptToolCalls) {
            const interruptConfig = resolvedConfigs[toolCall.name]!;

            /**
             * Create ActionRequest and ReviewConfig using helper method
             */
            const { actionRequest, reviewConfig } = await createActionAndConfig(
              toolCall,
              interruptConfig,
              state,
              runtime
            );
            actionRequests.push(actionRequest);
            reviewConfigs.push(reviewConfig);
          }

          /**
           * Create single HITLRequest with all actions and configs
           */
          const hitlRequest: HITLRequest = {
            actionRequests,
            reviewConfigs,
          };

          /**
           * Send interrupt and get response
           */
          const hitlResponse = (await interrupt(hitlRequest)) as HITLResponse;
          const decisions = hitlResponse.decisions;

          /**
           * Validate that decisions is a valid array before checking length
           */
          if (!decisions || !Array.isArray(decisions)) {
            throw new Error(
              "Invalid HITLResponse: decisions must be a non-empty array"
            );
          }

          /**
           * Validate that the number of decisions matches the number of interrupt tool calls
           */
          if (decisions.length !== interruptToolCalls.length) {
            throw new Error(
              `Number of human decisions (${decisions.length}) does not match number of hanging tool calls (${interruptToolCalls.length}).`
            );
          }

          const revisedToolCalls: ToolCall[] = [...autoApprovedToolCalls];
          const artificialToolMessages: ToolMessage[] = [];
          const hasRejectedToolCalls = decisions.some(
            (decision) => decision.type === "reject"
          );

          /**
           * Process each decision using helper method
           */
          for (let i = 0; i < decisions.length; i++) {
            const decision = decisions[i]!;
            const toolCall = interruptToolCalls[i]!;
            const interruptConfig = resolvedConfigs[toolCall.name]!;

            const { revisedToolCall, toolMessage } = processDecision(
              decision,
              toolCall,
              interruptConfig
            );

            if (
              revisedToolCall &&
              /**
               * If any decision is a rejected, we are going back to the model
               * with only the tool calls that were rejected as we don't know
               * the results of the approved/updated tool calls at this point.
               */
              (!hasRejectedToolCalls || decision.type === "reject")
            ) {
              revisedToolCalls.push(revisedToolCall);
            }
            if (toolMessage) {
              artificialToolMessages.push(toolMessage);
            }
          }

          /**
           * Update the AI message to only include approved tool calls
           */
          if (isAIMessage(lastMessage)) {
            lastMessage.tool_calls = revisedToolCalls;
          }

          const jumpTo: JumpToTarget | undefined = hasRejectedToolCalls
            ? "model"
            : undefined;
          return {
            messages: [lastMessage, ...artificialToolMessages],
            jumpTo,
          };
        }
      }
    }
  }
}
