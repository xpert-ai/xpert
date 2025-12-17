import { z } from "zod/v3";
import { z as z4 } from "zod/v4";
import { Inject, Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
  AgentMiddlewareStrategy,
  IAgentMiddlewareStrategy,
  CreateModelClientCommand,
  IAgentMiddlewareContext,
  ModelRequest,
  WrapModelCallHandler,
  WrapWorkflowNodeExecutionCommand,
} from "@xpert-ai/plugin-sdk";
import {
  TAgentMiddlewareMeta,
  ICopilotModel,
  AiModelTypeEnum,
  JsonSchemaObjectType,
  TAgentRunnableConfigurable,
  WorkflowNodeTypeEnum,
  JSONValue,
  IXpertAgentExecution,
} from "@metad/contracts";
import {
  interopSafeParse,
  InferInteropZodInput,
} from "@langchain/core/utils/types";
import { BaseLanguageModel } from "@langchain/core/language_models/base";
import { AIMessage } from "@langchain/core/messages";

/**
 * Configuration Schema Definition
 *
 * 【Requirement】All configurations are fallback model arrays:
 * - fallbackModels: List of fallback models (at least one), tried in sequence
 */
const modelFallbackSchema = z.object({
  fallbackModels: z.array(z.custom<ICopilotModel>()).nonempty(),
});

export type ModelFallbackMiddlewareConfig = InferInteropZodInput<
  typeof modelFallbackSchema
>;

/**
 * Model Fallback Middleware
 * 
 * Automatic fallback to alternative models on errors.
 * Retries failed model calls with alternative models in sequence until
 * success or all models exhausted. Primary model specified in Agent configuration.
 */
@Injectable()
@AgentMiddlewareStrategy("ModalFallbackMiddleware")
export class ModalFallbackMiddleware implements IAgentMiddlewareStrategy {
  @Inject(CommandBus)
  private readonly commandBus: CommandBus;
  readonly meta: TAgentMiddlewareMeta = {
    name: "ModalFallbackMiddleware",
    label: {
      en_US: "Model Fallback Middleware",
      zh_Hans: "模型回退中间件",
    },
    icon: {
      type: "svg",
      value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 30" style="display: block;"><g><path d="M3,19H9V13H3Zm12-6v6h6V13Zm4-8v6H18V6H6v4.293L7.14648,9.14648l.707.707L5.5,12.207,3.14648,9.85352l.707-.707L5,10.293V5Z"/></g></svg>`,
    },
    description: {
      en_US:
        "Automatically fallback to alternative models when the primary model fails. Useful for handling model outages, cost optimization, and provider redundancy.",
      zh_Hans:
        "当主模型失败时自动回退到备用模型。用于处理模型故障、成本优化和提供商冗余。",
    },
    configSchema: {
      type: 'object',
      properties: {
        fallbackModels: {
          type: 'array',
          'x-ui': {
            span: 2
          },
          title: {
            en_US: 'Fallback Models',
            zh_Hans: '备用模型',
          },
          description: {
            en_US:
              'Fallback models to try in order when the primary model fails.',
            zh_Hans: '主模型失败时按顺序尝试的备用模型列表。',
          },
          default: [{}],
          minItems: 1,
          items: {
            type: 'object',
            default: {},
            'x-ui': {
              component: 'ai-model-select',
              span: 12,
              inputs: {
                modelType: AiModelTypeEnum.LLM,
                hiddenLabel: true,
              },
            },
          },
        } as unknown as JsonSchemaObjectType['properties'][string],
      },
      required: ['fallbackModels'],
    },
  }

  async createMiddleware(
    options: ModelFallbackMiddlewareConfig,
    context: IAgentMiddlewareContext
  ) {
    const { data: userOptions, error } = interopSafeParse(
      modelFallbackSchema,
      options
    );
    if (error) {
      throw new Error(
        `Invalid model fallback middleware options: ${z4.prettifyError(error)}`
      );
    }

    return {
      name: "ModelFallbackMiddleware",
      wrapModelCall: async (
        request: ModelRequest,
        handler: WrapModelCallHandler,
      ): Promise<AIMessage> => {
        // Try primary model first
        let lastException: Error;
        try {
          // TODO: Test - Force trigger error to test fallback models
          // Uncomment the following line to automatically make the main model unusable.
          // if (process.env['FORCE_MODEL_ERROR'] === 'true') {
          //   throw new Error('Forced error to test fallback models');
          // }
          // throw new Error('Test: Skipping primary model to test fallback');
          // Test: Temporarily comment out the following line for testing
          return await handler(request);
          
        } catch (error) {
          lastException = error as Error;
        }

        // Try fallback models in sequence
        for (const fallbackModel of userOptions.fallbackModels) {
          try {

            const configurable = request.runtime.configurable as TAgentRunnableConfigurable
            const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
            
            // Store the result to return it after execution tracking
            let fallbackResult: AIMessage;
            
            // Wrap the handler call to match WrapWorkflowNodeExecutionCommand's expected signature
            const wrappedFallbackCall = async (
              execution: Partial<IXpertAgentExecution>
            ): Promise<{ output?: JSONValue; state: AIMessage }> => {
              // Execution parameter is required by WrapWorkflowNodeExecutionCommand signature
              void execution;
              
              const fallbackModelInstance = await this.commandBus.execute<
                CreateModelClientCommand<BaseLanguageModel>,
                BaseLanguageModel
              >(
                new CreateModelClientCommand<BaseLanguageModel>(fallbackModel, {
                  usageCallback: (event) => {
                    console.log(
                      `[Middleware ModelFallback] Model ${fallbackModel.model} Usage:`,
                      event
                    );
                  },
                })
              );

              fallbackResult = await handler({
                ...request,
                model: fallbackModelInstance,
              });

              return {
                state: fallbackResult,
                output: fallbackResult.content as JSONValue
              };
            };
            
            await this.commandBus.execute(new WrapWorkflowNodeExecutionCommand<AIMessage>(
              wrappedFallbackCall,
              {
              execution: {
                category: 'workflow',
                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                inputs: {},
                parentId: executionId,
                threadId: thread_id,
                checkpointNs: checkpoint_ns,
                checkpointId: checkpoint_id,
                agentKey: context.node.key,
                title: context.node.title
              },
              subscriber
            }))
            
            // Return the result after execution tracking completes
            if (!fallbackResult) {
              throw new Error('Fallback model execution failed to return a result');
            }
            return fallbackResult;
          } catch (error) {
            lastException = error as Error;
            continue;
          }
        }

        // All models failed, re-raise the last exception
        throw lastException;
      },
    };
  }
}