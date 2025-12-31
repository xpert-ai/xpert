import { z } from "zod/v3";
import z4 from "zod/v4";
import { BaseLanguageModel } from "@langchain/core/language_models/base";
import { interopSafeParse, type InferInteropZodInput } from "@langchain/core/utils/types";
import { HumanMessage, isHumanMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { Inject, Injectable } from "@nestjs/common";
import { AgentMiddleware, AgentMiddlewareStrategy, CreateModelClientCommand, IAgentMiddlewareContext, IAgentMiddlewareStrategy, ModelRequest, Runtime, WrapWorkflowNodeExecutionCommand } from "@xpert-ai/plugin-sdk";
import { AiModelTypeEnum, ICopilotModel, TAgentMiddlewareMeta, TAgentRunnableConfigurable, WorkflowNodeTypeEnum } from "@metad/contracts";
import { CommandBus } from "@nestjs/cqrs";


const DEFAULT_SYSTEM_PROMPT =
  "Your goal is to select the most relevant tools for answering the user's query.";

/**
 * Prepared inputs for tool selection.
 */
interface SelectionRequest {
  availableTools: StructuredToolInterface[];
  systemMessage: string;
  lastUserMessage: HumanMessage;
  model: BaseLanguageModel;
  validToolNames: string[];
}

/**
 * Create a structured output schema for tool selection.
 *
 * @param tools - Available tools to include in the schema.
 * @returns Zod schema where each tool name is a literal with its description.
 */
function createToolSelectionResponse(tools: StructuredToolInterface[]) {
  if (!tools || tools.length === 0) {
    throw new Error("Invalid usage: tools must be non-empty");
  }

  // Create a union of literals for each tool name
  const toolLiterals = tools.map((tool) => z.literal(tool.name));
  const toolEnum = z.union(
    toolLiterals as [
      z.ZodLiteral<string>,
      z.ZodLiteral<string>,
      ...z.ZodLiteral<string>[]
    ]
  );

  return z.object({
    tools: z
      .array(toolEnum)
      .describe("Tools to use. Place the most relevant tools first."),
  });
}

/**
 * Options for configuring the LLM Tool Selector middleware.
 */
export const LLMToolSelectorOptionsSchema = z.object({
  /**
   * The language model to use for tool selection (default: the provided model from the agent options).
   */
  model: z.custom<ICopilotModel>(), // z.string().or(z.instanceof(BaseLanguageModel)).optional(),
  /**
   * System prompt for the tool selection model.
   */
  systemPrompt: z.string().optional(),
  /**
   * Maximum number of tools to select. If the model selects more,
   * only the first maxTools will be used. No limit if not specified.
   */
  maxTools: z.number().optional(),
  /**
   * Method for the model to output selected tools.
   */
  outputMethod: z.enum(['functionCalling', 'jsonMode', 'jsonSchema']).optional().nullable(),
  /**
   * Tool names to always include regardless of selection.
   * These do not count against the maxTools limit.
   */
  alwaysInclude: z.array(z.string()).optional(),
});
export type LLMToolSelectorConfig = InferInteropZodInput<
  typeof LLMToolSelectorOptionsSchema
>;

const LLMToolSelectorName = "LLMToolSelector";

/**
 * Middleware for selecting tools using an LLM-based strategy.
 *
 * When an agent has many tools available, this middleware filters them down
 * to only the most relevant ones for the user's query. This reduces token usage
 * and helps the main model focus on the right tools.
 *
 * @param options - Configuration options for the middleware
 * @param options.model - The language model to use for tool selection (default: the provided model from the agent options).
 * @param options.systemPrompt - Instructions for the selection model.
 * @param options.maxTools - Maximum number of tools to select. If the model selects more,
 *   only the first maxTools will be used. No limit if not specified.
 * @param options.alwaysInclude - Tool names to always include regardless of selection.
 *   These do not count against the maxTools limit.
 *
 * @example
 * Limit to 3 tools:
 * ```ts
 * import { llmToolSelectorMiddleware } from "langchain/agents/middleware";
 *
 * const middleware = llmToolSelectorMiddleware({ maxTools: 3 });
 *
 * const agent = createAgent({
 *   model: "openai:gpt-4o",
 *   tools: [tool1, tool2, tool3, tool4, tool5],
 *   middleware: [middleware],
 * });
 * ```
 *
 * @example
 * Use a smaller model for selection:
 * ```ts
 * const middleware = llmToolSelectorMiddleware({
 *   model: "openai:gpt-4o-mini",
 *   maxTools: 2
 * });
 * ```
 */
@Injectable()
@AgentMiddlewareStrategy(LLMToolSelectorName)
export class LLMToolSelectorNameMiddleware implements IAgentMiddlewareStrategy {
  @Inject(CommandBus)
  private readonly commandBus: CommandBus;

  meta: TAgentMiddlewareMeta = {
    name: LLMToolSelectorName,
    label: {
      en_US: 'LLM Tool Selector',
      zh_Hans: 'LLM工具选择器',
    },
    description: {
      en_US: 'Middleware for selecting tools using an LLM-based strategy.',
      zh_Hans: '使用基于LLM的策略选择工具的中间件。',
    },
    icon: {
      type: 'svg',
      value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 731.69 727.49"><defs><style>.cls-1{fill:#fff;}.cls-2,.cls-5{fill:none;}.cls-2,.cls-3,.cls-4{stroke:#000;}.cls-2{stroke-linecap:round;stroke-width:18px;}.cls-2,.cls-3,.cls-4,.cls-5{stroke-miterlimit:10;}.cls-3{stroke-width:30px;}.cls-4{fill:#009245;stroke-width:21px;}.cls-5{stroke:#fff;stroke-width:38px;}</style></defs><path class="cls-1" d="M1091.38,808.44A36,36,0,0,1,1064.11,796L890.85,595.13a36,36,0,0,1,3.74-50.76l59.26-51.12a36,36,0,0,1,50.76,3.74l173.26,200.83a36,36,0,0,1-3.74,50.76l-59.26,51.12A35.94,35.94,0,0,1,1091.38,808.44Z" transform="translate(-538.81 -131.01)"/><path d="M977.34,478v13a29.46,29.46,0,0,1,22.34,10.22L1173,702.07a29.49,29.49,0,0,1-3.07,41.59l-59.25,51.12a29.51,29.51,0,0,1-41.6-3.06L895.77,590.88a29.49,29.49,0,0,1,3.07-41.59l59.25-51.12A29.47,29.47,0,0,1,977.34,491V478m0,0a42.32,42.32,0,0,0-27.74,10.32l-59.26,51.12a42.5,42.5,0,0,0-4.41,59.93l173.26,200.83a42.51,42.51,0,0,0,59.93,4.42l59.25-51.13a42.48,42.48,0,0,0,4.42-59.92L1009.53,492.74A42.39,42.39,0,0,0,977.34,478Z" transform="translate(-538.81 -131.01)"/><line class="cls-2" x1="382.39" y1="444.13" x2="549.96" y2="638.36"/><line class="cls-2" x1="412.69" y1="417.11" x2="580.26" y2="611.34"/><line class="cls-2" x1="445.75" y1="388.6" x2="613.31" y2="582.83"/><polyline class="cls-3" points="385.21 380.97 191.5 162.6 164.91 159.54 135.88 114.79 155.5 97.87 197.54 135.5 191.5 162.6"/><rect class="cls-3" x="851.22" y="251.99" width="54" height="410" transform="translate(41.56 -618.16) rotate(45)"/><circle class="cls-3" cx="144.25" cy="520.43" r="108.5"/><circle class="cls-3" cx="523.26" cy="141.42" r="108.5"/><path class="cls-1" d="M1042.08,150.13h122a0,0,0,0,1,0,0V260.88a53.24,53.24,0,0,1-53.24,53.24h-15.51a53.24,53.24,0,0,1-53.24-53.24V150.13a0,0,0,0,1,0,0Z" transform="translate(-51.58 -843.02) rotate(45)"/><path class="cls-1" d="M578.92,611.87h122a0,0,0,0,1,0,0V722.63a53.24,53.24,0,0,1-53.24,53.24H632.17a53.24,53.24,0,0,1-53.24-53.24V611.87a0,0,0,0,1,0,0Z" transform="translate(62.97 1505.99) rotate(-135)"/><circle class="cls-4" cx="554.69" cy="550.49" r="166.5"/><polyline class="cls-5" points="446.19 523.99 528.69 625.49 672.19 496.99"/></svg>`
    },
    configSchema: {
      type: 'object',
      properties: {
        model: {
          type: 'object',
          title: {
            en_US: 'LLM',
            zh_Hans: '大语言模型',
          },
          'x-ui': {
            component: 'ai-model-select',
            span: 2,
            inputs: {
              modelType: AiModelTypeEnum.LLM,
              hiddenLabel: true,
            }
          },
        },
        systemPrompt: {
          type: 'string',
          title: {
            en_US: 'System Prompt',
            zh_Hans: '系统提示语',
          },
          description: {
            en_US: 'Instructions for the selection model.',
            zh_Hans: '选择模型的指令。',
          },
          'x-ui': {
            component: 'textarea',
            span: 2,
          },
        },
        maxTools: {
          type: 'number',
          title: {
            en_US: 'Max Tools',
            zh_Hans: '最大工具数',
          },
          description: {
            en_US: 'Maximum number of tools to select. No limit if not specified.',
            zh_Hans: '要选择的最大工具数。如果未指定，则无限制。',
          },
        },
        outputMethod: {
          type: 'string',
          title: {
            en_US: 'Output Method',
            zh_Hans: '输出方法',
          },
          description: {
            en_US: 'Method for the model to output selected tools.',
            zh_Hans: '模型输出所选工具的方法。',
          },
          enum: ['functionCalling', 'jsonMode', 'jsonSchema'],
          'x-ui': {
            enumLabels: {
              functionCalling: {
                en_US: 'Function Calling',
                zh_Hans: '函数调用',
              },
              jsonMode: {
                en_US: 'JSON Mode',
                zh_Hans: 'JSON模式',
              },
              jsonSchema: {
                en_US: 'JSON Schema',
                zh_Hans: 'JSON架构',
              }
            }
          }
        },
        alwaysInclude: {
          type: 'array',
          title: {
            en_US: 'Always Include',
            zh_Hans: '始终包含',
          },
          description: {
            en_US: 'Tool names to always include regardless of selection.',
            zh_Hans: '无论选择如何，始终包含的工具名称。',
          },
          items: {
            type: 'string',
          },
          'x-ui': {
            span: 2,
          }
        }
      }
    }
  }
  
  async createMiddleware(options: LLMToolSelectorConfig, context: IAgentMiddlewareContext): Promise<AgentMiddleware> {
    const { data: userOptions, error } = interopSafeParse(LLMToolSelectorOptionsSchema, options);
        if (error) {
          throw new Error(
            `Invalid llmToolSelector middleware options: ${z4.prettifyError(error)}`
          );
        }

    const model = await this.commandBus.execute(new CreateModelClientCommand<BaseLanguageModel>(userOptions.model, {
              usageCallback: (event) => {
                console.log('[Middleware llmToolSelector] Model Usage:', event);
              }
            }))
    const commandBus = this.commandBus;
    
    return {
      name: "LLMToolSelector",
      contextSchema: LLMToolSelectorOptionsSchema,
      async wrapModelCall(request, handler) {
        const selectionRequest = await prepareSelectionRequest(
          request,
          {...options, model },
          request.runtime
        );
        if (!selectionRequest) {
          return handler(request);
        }

        // Create dynamic response model with union of literal tool names
        const toolSelectionSchema = createToolSelectionResponse(
          selectionRequest.availableTools
        );
        const structuredModel = selectionRequest.model.withStructuredOutput?.(
            toolSelectionSchema,
            {
              method: userOptions.outputMethod || 'jsonSchema',
            }
          );

        // Execution logging
        const configurable = request.runtime.configurable as TAgentRunnableConfigurable
        const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
        const response = await commandBus.execute(new WrapWorkflowNodeExecutionCommand(async () => {
            const response = await structuredModel?.invoke([
              { role: "system", content: selectionRequest.systemMessage },
              selectionRequest.lastUserMessage,
            ]);

            // Response should be an object with a tools array
            if (!response || typeof response !== "object" || !("tools" in response)) {
              throw new Error(
                `Expected object response with tools array, got ${typeof response}`
              );
            }
            return {
              state: response as { tools: string[] },
              output: response.tools
            }
        },
        {
          execution: {
            category: 'workflow',
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            inputs: {
              system: selectionRequest.systemMessage,
              user: selectionRequest.lastUserMessage.content
            },
            parentId: executionId,
            threadId: thread_id,
            checkpointNs: checkpoint_ns,
            checkpointId: checkpoint_id,
            agentKey: context.node.key,
            title: context.node.title
          },
          subscriber
        }))

        return handler(
          processSelectionResponse(
            response as { tools: string[] },
            selectionRequest.availableTools,
            selectionRequest.validToolNames,
            request,
            options
          )
        );
      },
    }
  }
}

/**
 * Prepare inputs for tool selection.
 *
 * @param request - The model request to process.
 * @param options - Configuration options.
 * @param runtime - Runtime context.
 * @returns SelectionRequest with prepared inputs, or null if no selection is needed.
 */
async function prepareSelectionRequest<
  TState extends Record<string, unknown> = Record<string, unknown>,
  TContext = unknown
>(
  request: ModelRequest<TState, TContext>,
  options: Omit<LLMToolSelectorConfig, "model"> & { model: BaseLanguageModel },
  runtime: Runtime<LLMToolSelectorConfig>
): Promise<SelectionRequest | undefined> {
  const model = options.model;
  const maxTools = runtime.context?.maxTools ?? options.maxTools;
  const alwaysInclude =
    runtime.context?.alwaysInclude ?? options.alwaysInclude ?? [];
  const systemPrompt =
    runtime.context?.systemPrompt ??
    options.systemPrompt ??
    DEFAULT_SYSTEM_PROMPT;

  /**
   * If no tools available, return null
   */
  if (!request.tools || request.tools.length === 0) {
    return undefined;
  }

  /**
   * Filter to only StructuredToolInterface instances (exclude provider-specific tool dicts)
   */
  const baseTools = request.tools.filter(
    (tool): tool is StructuredToolInterface =>
      typeof tool === "object" &&
      "name" in tool &&
      "description" in tool &&
      typeof tool.name === "string"
  );

  /**
   * Validate that alwaysInclude tools exist
   */
  if (alwaysInclude.length > 0) {
    const availableToolNames = new Set(baseTools.map((tool) => tool.name));
    const missingTools = alwaysInclude.filter(
      (name) => !availableToolNames.has(name)
    );
    if (missingTools.length > 0) {
      throw new Error(
        `Tools in alwaysInclude not found in request: ${missingTools.join(
          ", "
        )}. ` +
          `Available tools: ${Array.from(availableToolNames).sort().join(", ")}`
      );
    }
  }

  /**
   * Separate tools that are always included from those available for selection
   */
  const availableTools = baseTools.filter(
    (tool) => !alwaysInclude.includes(tool.name)
  );

  /**
   * If no tools available for selection, return null
   */
  if (availableTools.length === 0) {
    return undefined;
  }

  let systemMessage = systemPrompt;
  /**
   * If there's a maxTools limit, append instructions to the system prompt
   */
  if (maxTools !== undefined) {
    systemMessage +=
      `\nIMPORTANT: List the tool names in order of relevance, ` +
      `with the most relevant first. ` +
      `If you exceed the maximum number of tools, ` +
      `only the first ${maxTools} will be used.`;
  }

  /**
   * Get the last user message from the conversation history
   */
  let lastUserMessage: HumanMessage | undefined;
  for (const message of request.messages) {
    if (isHumanMessage(message)) {
      lastUserMessage = message;
    }
  }

  if (!lastUserMessage) {
    throw new Error("No user message found in request messages");
  }

  const modelInstance = !model
    ? (request.model as BaseLanguageModel)
    : model;

  const validToolNames = availableTools.map((tool) => tool.name);

  return {
    availableTools,
    systemMessage,
    lastUserMessage,
    model: modelInstance,
    validToolNames,
  };
}

/**
 * Process the selection response and return filtered ModelRequest.
 *
 * @param response - The structured output response from the model.
 * @param availableTools - Tools available for selection.
 * @param validToolNames - Valid tool names that can be selected.
 * @param request - Original model request.
 * @param options - Configuration options.
 * @returns Modified ModelRequest with filtered tools.
 */
function processSelectionResponse<
  TState extends Record<string, unknown> = Record<string, unknown>,
  TContext = unknown
>(
  response: { tools: string[] },
  availableTools: StructuredToolInterface[],
  validToolNames: string[],
  request: ModelRequest<TState, TContext>,
  options: LLMToolSelectorConfig
): ModelRequest<TState, TContext> {
  const maxTools = options.maxTools;
  const alwaysInclude = options.alwaysInclude ?? [];

  const selectedToolNames: string[] = [];
  const invalidToolSelections: string[] = [];

  for (const toolName of response.tools) {
    if (!validToolNames.includes(toolName)) {
      invalidToolSelections.push(toolName);
      continue;
    }

    /**
     * Only add if not already selected and within maxTools limit
     */
    if (
      !selectedToolNames.includes(toolName) &&
      (maxTools === undefined || selectedToolNames.length < maxTools)
    ) {
      selectedToolNames.push(toolName);
    }
  }

  if (invalidToolSelections.length > 0) {
    throw new Error(
      `Model selected invalid tools: ${invalidToolSelections.join(", ")}`
    );
  }

  /**
   * Filter tools based on selection
   */
  const selectedTools = availableTools.filter((tool) =>
    selectedToolNames.includes(tool.name)
  );

  /**
   * Append always-included tools
   */
  const alwaysIncludedTools = (request.tools ?? []).filter(
    (tool): tool is StructuredToolInterface =>
      typeof tool === "object" &&
      "name" in tool &&
      typeof tool.name === "string" &&
      alwaysInclude.includes(tool.name)
  );
  selectedTools.push(...alwaysIncludedTools);

  /**
   * Also preserve any provider-specific tool dicts from the original request
   */
  const providerTools = (request.tools ?? []).filter(
    (tool) =>
      !(
        typeof tool === "object" &&
        "name" in tool &&
        "description" in tool &&
        typeof tool.name === "string"
      )
  );

  return {
    ...request,
    tools: [...selectedTools, ...providerTools],
  };
}
