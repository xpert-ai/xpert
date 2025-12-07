import { z } from "zod/v3";
import { z as z4 } from "zod/v4";
import { v4 as uuid } from "uuid";
import {
  BaseMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
  RemoveMessage,
  trimMessages,
  HumanMessage,
  isSystemMessage,
  isAIMessage,
} from "@langchain/core/messages";
import {
  BaseLanguageModel,
  getModelContextSize,
} from "@langchain/core/language_models/base";
import {
  interopSafeParse,
  InferInteropZodInput,
} from "@langchain/core/utils/types";
import { REMOVE_ALL_MESSAGES } from "@langchain/langgraph";
import { Inject, Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { AgentMiddleware, AgentMiddlewareStrategy, CreateModelClientCommand, IAgentMiddlewareContext, IAgentMiddlewareStrategy, WrapWorkflowNodeExecutionCommand } from "@xpert-ai/plugin-sdk";
import { AiModelTypeEnum, ICopilotModel, TAgentMiddlewareMeta, TAgentRunnableConfigurable, WorkflowNodeTypeEnum } from "@metad/contracts";
import { isNil, omitBy } from "lodash";
import { countTokensApproximately, hasToolCalls } from "./utils";

export const DEFAULT_SUMMARY_PROMPT = `<role>
Context Extraction Assistant
</role>

<primary_objective>
Your sole objective in this task is to extract the highest quality/most relevant context from the conversation history below.
</primary_objective>

<objective_information>
You're nearing the total number of input tokens you can accept, so you must extract the highest quality/most relevant pieces of information from your conversation history.
This context will then overwrite the conversation history presented below. Because of this, ensure the context you extract is only the most important information to your overall goal.
</objective_information>

<instructions>
The conversation history below will be replaced with the context you extract in this step. Because of this, you must do your very best to extract and record all of the most important context from the conversation history.
You want to ensure that you don't repeat any actions you've already completed, so the context you extract from the conversation history should be focused on the most important information to your overall goal.
</instructions>

The user will message you with the full message history you'll be extracting context from, to then replace. Carefully read over it all, and think deeply about what information is most important to your overall goal that should be saved:

With all of this in mind, please carefully read over the entire conversation history, and extract the most important and relevant context to replace it so that you can free up space in the conversation history.
Respond ONLY with the extracted context. Do not include any additional information, or text before or after the extracted context.

<messages>
Messages to summarize:
{messages}
</messages>`;

const DEFAULT_MESSAGES_TO_KEEP = 20;
const DEFAULT_TRIM_TOKEN_LIMIT = 4000;
const DEFAULT_FALLBACK_MESSAGE_COUNT = 15;
const SEARCH_RANGE_FOR_TOOL_PAIRS = 5;

const tokenCounterSchema = z
  .function()
  .args(z.array(z.custom<BaseMessage>()))
  .returns(z.union([z.number(), z.promise(z.number())]));
export type TokenCounter = (
  messages: BaseMessage[]
) => number | Promise<number>;

export const contextSizeSchema = z
  .object({
    fraction: z
      .number()
      .gt(0, "Fraction must be greater than 0")
      .max(1, "Fraction must be less than or equal to 1")
      .nullable()
      .optional(),
    tokens: z.number().positive("Tokens must be greater than 0").nullable().optional(),
    messages: z
      .number()
      .int("Messages must be an integer")
      .positive("Messages must be greater than 0")
      .nullable()
      .optional(),
  })
  .refine(
    (data) => {
      const count = [data.fraction, data.tokens, data.messages].filter((v) => v != null).length;
      return count === 1;
    },
    {
      message: "At least one of fraction, tokens, or messages must be provided",
    }
  );
export type ContextSize = z.infer<typeof contextSizeSchema>;

export const keepSchema = z
  .object({
    fraction: z
      .number()
      .min(0, "Messages must be non-negative")
      .max(1, "Fraction must be less than or equal to 1")
      .nullable()
      .optional(),
    tokens: z.number().min(0, "Tokens must be greater than or equal to 0").nullable().optional(),
    messages: z
      .number()
      .int("Messages must be an integer")
      .min(0, "Messages must be non-negative")
      .nullable()
      .optional(),
  })
  .refine(
    (data) => {
      const count = [data.fraction, data.tokens, data.messages].filter((v) => v != null).length;
      return count === 1;
    },
    {
      message: "Exactly one of fraction, tokens, or messages must be provided",
    }
  );
export type KeepSize = z.infer<typeof keepSchema>;

const contextSchema = z.object({
  model: z.custom<ICopilotModel>(),
  trigger: contextSizeSchema.nullable().optional(),
  keep: keepSchema.nullable().optional(),
  tokenCounter: tokenCounterSchema.nullable().optional(),
  summaryPrompt: z.string().default(DEFAULT_SUMMARY_PROMPT),
  /**
   * Number of tokens to trim to before summarizing
   */
  trimTokensToSummarize: z.number().nullable().optional(),
  summaryPrefix: z.string().nullable().optional(),
});

export type SummarizationMiddlewareConfig = InferInteropZodInput<
  typeof contextSchema
>;

export function getProfileLimits(input: BaseLanguageModel): number | undefined {
  // Backward compatibility for langchain <1.0.0
  if (input.metadata && "profile" in input.metadata) {
    const profile = input.metadata['profile'] as object;
    if ("maxInputTokens" in profile && (typeof profile.maxInputTokens === "number" || profile.maxInputTokens == null)) {
      return (profile.maxInputTokens as number) ?? undefined;
    }
  }
  // Langchain v1.0.0+
  if (
    "profile" in input &&
    typeof input.profile === "object" &&
    input.profile &&
    "maxInputTokens" in input.profile &&
    (typeof input.profile.maxInputTokens === "number" ||
      input.profile.maxInputTokens == null)
  ) {
    return (input.profile.maxInputTokens as number) ?? undefined;
  }

  if ("model" in input && typeof input.model === "string") {
    return getModelContextSize(input.model);
  }
  if ("modelName" in input && typeof input.modelName === "string") {
    return getModelContextSize(input.modelName);
  }

  return undefined;
}

@Injectable()
@AgentMiddlewareStrategy('SummarizationMiddleware')
export class SummarizationMiddleware implements IAgentMiddlewareStrategy {

  @Inject(CommandBus)
  private readonly commandBus: CommandBus;

  readonly meta: TAgentMiddlewareMeta = {
    name: 'SummarizationMiddleware',
    label: {
      en_US: 'Summarization Middleware',
      zh_Hans: '上下文压缩中间件',
    },
    icon: {
      type: 'svg',
      value: `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" style="display: block;" viewBox="0 0 2048 2048" width="512" height="512" preserveAspectRatio="none">
<path transform="translate(0,0)" fill="rgb(0,0,0)" d="M 528.232 723.7 C 520.516 722.343 510.162 719.394 506.393 712.395 C 498.775 698.252 501.632 668.254 501.641 652.288 L 501.663 568.014 L 501.679 314.002 L 501.665 179.783 C 501.648 159.838 500.464 117.017 504.078 100.059 C 509.554 74.9529 524.732 53.0294 546.303 39.0662 C 577.31 19.3218 617.992 23.9477 653.671 23.947 L 762.076 23.9507 L 1099.65 23.9844 L 1287.98 23.9357 C 1308.44 23.9313 1376.23 19.2083 1391.53 32.4262 C 1401.54 41.079 1421.98 62.6525 1432.48 73.154 L 1508.53 149.195 C 1533.63 174.294 1561.39 200.423 1584.46 226.924 C 1590.56 233.937 1588.45 290.487 1588.45 302.736 L 1588.43 423.001 L 1588.42 602.643 C 1588.46 632.176 1591.02 679.091 1585.43 709.178 C 1584.01 716.803 1571.49 721.742 1563.95 723.8 C 1563.79 740.632 1563.89 758.278 1563.21 775.031 C 1566.98 775.798 1600 774.984 1607.1 774.987 L 1721.37 774.996 C 1742.46 774.989 1777.5 773.893 1797.15 777.506 C 1811.87 780.232 1825.93 785.779 1838.55 793.843 C 1864.55 810.49 1882.79 836.859 1889.21 867.055 C 1895.81 897.596 1889.73 929.51 1872.35 955.479 C 1849.91 989.328 1821.21 1000.98 1783.43 1008.55 C 1772.29 1018.97 1758.05 1035.33 1747.38 1046.89 L 1683.9 1115.66 L 1484.55 1331.46 L 1334.44 1493.98 L 1292.75 1538.96 C 1283.9 1548.47 1272.2 1560.38 1264.65 1570.58 C 1263.07 1587.81 1263.55 1618.92 1263.21 1637.67 L 1260.85 1770.43 C 1260.62 1786.58 1260.34 1802.86 1260.14 1819 C 1259.82 1843.81 1256.87 1863.79 1239.45 1882.41 C 1232.48 1889.98 1224.03 1896.05 1214.63 1900.25 C 1200.05 1906.82 1178.33 1914.1 1162.96 1919.7 L 1074.53 1951.87 L 952.502 1996.36 C 930.665 2004.32 887.697 2022.6 866.344 2024.03 C 826.652 2026.7 788.901 1992.43 788.301 1951.9 C 787.864 1922.43 787.629 1891.46 787.102 1861.29 L 784.301 1640.27 C 784.171 1629.13 785.067 1573.78 782.225 1570.2 C 764.676 1548.09 710.035 1490.28 691.537 1470.25 L 499.097 1261.99 L 341.021 1090.83 C 316.019 1063.89 290.094 1034.48 264.43 1008.47 C 237.365 1002.81 219.619 998.416 197.591 980.244 C 174.093 960.86 159.363 932.852 156.707 902.507 C 153.732 870.991 163.643 839.613 184.181 815.523 C 224.011 768.956 271.753 774.972 326.9 774.98 L 458.596 775.091 C 476.234 775.12 510.003 776.147 526.607 774.779 L 527.757 774.674 C 526.667 765.521 527.072 732.703 528.232 723.7 z"/>
<path transform="translate(0,0)" fill="rgb(254,254,254)" d="M 528.232 723.7 C 520.516 722.343 510.162 719.394 506.393 712.395 C 498.775 698.252 501.632 668.254 501.641 652.288 L 501.663 568.014 L 501.679 314.002 L 501.665 179.783 C 501.648 159.838 500.464 117.017 504.078 100.059 C 509.554 74.9529 524.732 53.0294 546.303 39.0662 C 577.31 19.3218 617.992 23.9477 653.671 23.947 L 762.076 23.9507 L 1099.65 23.9844 L 1287.98 23.9357 C 1308.44 23.9313 1376.23 19.2083 1391.53 32.4262 C 1401.54 41.079 1421.98 62.6525 1432.48 73.154 L 1508.53 149.195 C 1533.63 174.294 1561.39 200.423 1584.46 226.924 C 1590.56 233.937 1588.45 290.487 1588.45 302.736 L 1588.43 423.001 L 1588.42 602.643 C 1588.46 632.176 1591.02 679.091 1585.43 709.178 C 1584.01 716.803 1571.49 721.742 1563.95 723.8 C 1563.79 740.632 1563.89 758.278 1563.21 775.031 C 1536.69 774.149 1504.13 775.039 1477.26 775.041 L 1300.08 775.045 L 768.97 775.048 L 614.19 775.055 C 586.905 775.066 554.729 775.854 527.757 774.674 C 526.667 765.521 527.072 732.703 528.232 723.7 z"/>
<path transform="translate(0,0)" fill="rgb(0,0,0)" d="M 528.232 723.7 C 520.516 722.343 510.162 719.394 506.393 712.395 C 498.775 698.252 501.632 668.254 501.641 652.288 L 501.663 568.014 L 501.679 314.002 L 501.665 179.783 C 501.648 159.838 500.464 117.017 504.078 100.059 C 509.554 74.9529 524.732 53.0294 546.303 39.0662 C 577.31 19.3218 617.992 23.9477 653.671 23.947 L 762.076 23.9507 L 1099.65 23.9844 L 1287.98 23.9357 C 1308.44 23.9313 1376.23 19.2083 1391.53 32.4262 C 1401.54 41.079 1421.98 62.6525 1432.48 73.154 L 1508.53 149.195 C 1533.63 174.294 1561.39 200.423 1584.46 226.924 C 1590.56 233.937 1588.45 290.487 1588.45 302.736 L 1588.43 423.001 L 1588.42 602.643 C 1588.46 632.176 1591.02 679.091 1585.43 709.178 C 1584.01 716.803 1571.49 721.742 1563.95 723.8 C 1550.71 721.536 1538.61 716.509 1537.49 701.082 C 1536.36 685.53 1536.84 669.621 1536.84 654.002 L 1536.85 563.957 L 1536.87 266.049 C 1490.31 265.403 1443.51 266.602 1396.93 266.01 C 1339.12 265.275 1346.66 217.292 1346.68 176.466 L 1346.71 76.079 L 800.061 75.9939 L 665.702 75.9606 C 640.411 75.9582 607.476 74.467 583.023 78.7017 C 573.051 80.4285 557.62 97.0339 555.556 108.397 C 552.83 123.404 553.677 141.171 553.689 156.755 L 553.772 229.894 L 553.733 547.063 L 553.802 640.376 C 553.873 658.193 554.258 676.128 553.736 693.926 C 553.177 712.946 545.478 719.39 528.232 723.7 z"/>
<path transform="translate(0,0)" fill="rgb(254,254,254)" d="M 1398.69 113.358 C 1404.17 117.447 1433.49 147.104 1439.19 153.186 C 1457.13 172.319 1481.25 193.671 1498.3 212.678 L 1497.63 214.001 L 1398.67 213.914 C 1397.45 182.895 1398.49 144.93 1398.69 113.358 z"/>
<path transform="translate(0,0)" fill="rgb(0,0,0)" d="M 729.622 119.377 C 776.53 117.361 836.728 119.063 884.742 119.037 L 945.325 119.012 C 971.95 119.026 1000.05 116.558 1021.91 134.894 C 1073.95 178.543 1049.77 258.35 981.241 265.617 C 963.883 266.469 943.089 265.963 925.521 265.967 L 825.727 265.961 L 766.096 265.954 C 736.519 265.987 711.132 269.183 686.573 249.254 C 671.534 237.037 662.038 219.286 660.222 199.995 C 658.317 180.313 664.252 160.674 676.739 145.342 C 690.502 128.645 708.684 121.507 729.622 119.377 z"/>
<path transform="translate(0,0)" fill="rgb(63,170,232)" d="M 729.563 171.2 C 753.639 170.077 977.239 169.544 984.401 172.663 C 990.405 175.278 995.352 180.727 997.405 186.946 C 999.215 192.429 998.035 196.851 995.48 201.873 C 991.939 208.829 987.044 211.536 979.806 213.853 C 947.938 214.999 914.836 213.719 882.816 214.063 C 834.083 214.585 785.191 213.832 736.453 213.916 C 707.506 213.966 701.492 180.225 729.563 171.2 z"/>
<path transform="translate(0,0)" fill="rgb(0,0,0)" d="M 682.968 645.159 C 721.272 643.844 764.992 644.916 803.749 644.915 L 1031.9 644.907 L 1276.24 644.906 C 1318.26 644.907 1360.46 644.774 1402.49 645.082 C 1407.09 645.229 1411.47 645.384 1415.72 647.42 C 1428.77 653.67 1434.79 669.057 1427.81 682.113 C 1423.23 690.676 1418.23 693.327 1409.43 696.294 C 1398.55 697.917 1347.77 696.973 1333.58 696.954 L 1175.55 696.934 L 857.008 696.962 C 801.531 696.98 746.048 697.139 690.575 696.868 C 676.162 696.797 663.495 691.387 660.282 675.866 C 658.947 669.223 660.334 662.323 664.131 656.711 C 669.15 649.269 674.55 646.771 682.968 645.159 z"/>
<path transform="translate(0,0)" fill="rgb(0,0,0)" d="M 681.594 503.104 C 708.716 501.649 748.604 502.851 776.397 502.851 L 963.221 502.863 L 1250.19 502.885 C 1300.13 502.873 1350.15 502.747 1400.08 502.923 C 1405.55 503.062 1409.59 502.731 1414.65 505.055 C 1438.37 515.942 1434.96 545.771 1410.88 553.844 C 1395.05 555.935 1347.55 554.766 1328.94 554.741 L 1170.95 554.726 L 855.48 554.759 C 800.622 554.777 745.759 554.905 690.905 554.679 C 677.342 554.623 666.318 551.35 661.265 537.342 C 658.949 530.884 659.367 523.76 662.424 517.618 C 666.756 508.891 672.827 505.755 681.594 503.104 z"/>
<path transform="translate(0,0)" fill="rgb(0,0,0)" d="M 681.404 361.246 C 718.7 359.835 762.138 360.943 799.858 360.943 L 1022.38 360.929 L 1273.13 360.915 C 1316.45 360.913 1359.79 360.805 1403.11 361.077 C 1415.28 361.154 1425.46 366.609 1429.47 378.693 C 1431.56 385.2 1430.92 392.276 1427.7 398.307 C 1423.46 406.299 1418.45 409.291 1410.19 411.837 C 1397.37 413.791 1351.75 412.747 1335.77 412.718 L 1185.68 412.686 L 858.782 412.701 C 803.076 412.709 747.365 412.88 691.662 412.675 C 677.519 412.623 664.994 408.903 660.748 393.675 C 658.916 387.001 659.856 379.87 663.354 373.899 C 667.834 366.245 673.174 363.322 681.404 361.246 z"/>
<path transform="translate(0,0)" fill="rgb(63,170,232)" d="M 335.091 1007.31 L 1266.36 1007.35 L 1568.13 1007.35 L 1661.3 1007.38 C 1676.89 1007.43 1699.07 1008.3 1714.15 1007.17 C 1697.89 1022.96 1677.21 1046.63 1661.41 1063.73 L 1559.58 1173.99 L 1249.72 1509.55 C 1207.8 1553.61 1213.41 1540.92 1211.93 1600.56 L 1209.33 1759.23 C 1208.92 1784.15 1208.93 1809.53 1207.19 1834.35 C 1205.94 1852.15 1185.68 1855.56 1172.14 1861.1 C 1164.86 1864.08 1156.41 1866.84 1148.85 1869.59 L 1070.6 1898.06 L 942.023 1944.9 C 920.802 1952.63 899.441 1960.7 878.145 1968.16 C 871.665 1969.97 863.93 1972.72 857.209 1971.01 C 840.922 1966.74 840.053 1952.99 839.596 1938.93 C 838.858 1916.23 839.126 1893.74 838.886 1871.12 L 836.497 1651.53 C 836.101 1626.52 835.744 1601.53 835.555 1576.51 C 835.494 1568.39 836.269 1552.74 831.268 1546.31 C 819.299 1530.93 805.2 1516.64 791.931 1502.29 L 720.564 1425.05 L 455.082 1137.63 L 376.172 1052.32 C 365.467 1040.77 343.968 1018.84 335.091 1007.31 z"/>
<path transform="translate(0,0)" fill="rgb(254,254,254)" d="M 266.727 827.333 C 277.478 826.061 309.419 826.9 322.007 826.923 L 431.525 826.974 L 804.071 826.943 L 1453.1 826.956 L 1663.05 826.941 C 1700.7 826.913 1738.38 826.618 1776.01 827.144 C 1788.45 827.318 1802.05 831.388 1812.34 838.482 C 1826.19 848.152 1835.68 862.89 1838.75 879.505 C 1845.58 917.212 1821.29 948.578 1784.18 954.851 C 1753.11 956.572 1717.53 955.756 1686.08 955.756 L 1524.63 955.756 L 1027.36 955.746 L 524.006 955.753 L 360.918 955.755 C 331.78 955.756 302.731 955.608 273.596 955.393 C 241.396 955.155 214.275 934.819 209.044 902.165 C 206.112 884.925 210.268 867.231 220.567 853.098 C 232.36 837.182 247.647 830.173 266.727 827.333 z"/>
</svg>`
    },
    description: {
      en_US: 'Middleware that summarizes conversation history to manage token limits.',
      zh_Hans: '用于总结对话历史以管理令牌限制的中间件。',
    },
    configSchema: {
      type: 'object',
      properties: {
        model: {
          type: 'object',
          title: {
            en_US: 'Language Model Settings',
            zh_Hans: '语言模型设置',
          },
          'x-ui': {
            component: 'ai-model-select',
            span: 2,
            inputs: {
              modelType: AiModelTypeEnum.LLM,
            }
          },
        },
        trigger: {
          type: 'object',
          title: {
            en_US: 'Summarization Trigger',
            zh_Hans: '压缩触发条件',
          },
          properties: {
            fraction: {
              type: 'number',
              title: {
                en_US: 'Fraction of Context Size',
                zh_Hans: '上下文大小的比例',
              },
              description: {
                en_US: "Fraction of the model's context size to use to trigger summarization",
                zh_Hans: '用作触发压缩的模型上下文大小的比例',
              },
            },
            tokens: {
              type: 'number',
              title: {
                en_US: 'Number of Tokens',
                zh_Hans: '词元数量',
              },
              description: {
                en_US: 'Number of tokens to use as the trigger',
                zh_Hans: '用作触发的词元数量',
              },
            },
            messages: {
              type: 'number',
              title: {
                en_US: 'Number of Messages',
                zh_Hans: '消息数量',
              },
              description: {
                en_US: 'Number of messages to use as the trigger',
                zh_Hans: '用作触发的消息数量',
              },
            }
          }
        },
        keep: {
          type: 'object',
          title: {
            en_US: 'Keep Conditions',
            zh_Hans: '保留设置',
          },
          properties: {
            fraction: {
              type: 'number',
              title: {
                en_US: 'Fraction of Context Size',
                zh_Hans: '上下文大小的比例',
              },
              description: {
                en_US: "Fraction of the model's context size to always keep",
                zh_Hans: '始终保留的模型上下文大小的比例',
              },
            },
            tokens: {
              type: 'number',
              title: {
                en_US: 'Number of Tokens',
                zh_Hans: '词元数量',
              },
              description: {
                en_US: 'Number of tokens to always keep',
                zh_Hans: '始终保留的词元数量',
              },
            },
            messages: {
              type: 'number',
              title: {
                en_US: 'Messages to Keep',
                zh_Hans: '保留的消息',
              },
              description: {
                en_US: 'Number of recent messages to always keep',
                zh_Hans: '始终保留的最近消息数量',
              },
            }
          }
        },
        summaryPrompt: {
          type: 'string',
          title: {
            en_US: 'Summary Prompt',
            zh_Hans: '总结提示',
          },
          description: {
            en_US: 'Prompt template used for summarization',
            zh_Hans: '用于压缩的提示模板',
          },
          'x-ui': {
            component: 'textarea',
            span: 2
          }
        },
        summaryPrefix: {
          type: 'string',
          title: {
            en_US: 'Summary Prefix',
            zh_Hans: '总结前缀',
          },
          description: {
            en_US: 'Prefix to add before the summary',
            zh_Hans: '在总结前添加的前缀',
          },
          'x-ui': {
            component: 'textarea',
            span: 2
          }
        }
      }
    }
  };

  async createMiddleware(options: SummarizationMiddlewareConfig, context: IAgentMiddlewareContext) {
    const { data: userOptions, error } = interopSafeParse(contextSchema, options);
    if (error) {
      throw new Error(
        `Invalid summarization middleware options: ${z4.prettifyError(error)}`
      );
    }

    return {
      name: 'SummarizationMiddleware',
      tools: [],
      beforeModel: async (state, runtime) => {
        const trigger: ContextSize | undefined = userOptions.trigger;
        const keep: KeepSize | undefined = userOptions.keep;

        const runtimeContext = (runtime as { context?: any })?.context;
        const resolvedTrigger =
          runtimeContext?.trigger !== undefined ? runtimeContext.trigger : trigger;
        const resolvedKeep =
          runtimeContext?.keep !== undefined
            ? runtimeContext.keep
            : keep ?? { messages: DEFAULT_MESSAGES_TO_KEEP };

        const validatedKeep = omitBy(keepSchema.parse(resolvedKeep), isNil);

        let triggerConditions: ContextSize[] = [];
        if (resolvedTrigger === undefined) {
          triggerConditions = [];
        } else {
          triggerConditions = [
            omitBy(contextSizeSchema.parse(resolvedTrigger), isNil)
          ];
        }

        const requiresProfile =
          triggerConditions.some((c) => "fraction" in c) ||
          "fraction" in validatedKeep;

        const model = await this.commandBus.execute(new CreateModelClientCommand<BaseLanguageModel>(userOptions.model, {
          usageCallback: (event) => {
            console.log('[Middleware Summarization] Model Usage:', event);
          }
        }))

        if (requiresProfile && !getProfileLimits(model)) {
          throw new Error(
            "Model profile information is required to use fractional token limits. " +
              "Use absolute token counts instead."
          );
        }

        const summaryPrompt =
          runtimeContext?.summaryPrompt === DEFAULT_SUMMARY_PROMPT
            ? userOptions.summaryPrompt ?? DEFAULT_SUMMARY_PROMPT
            : runtimeContext?.summaryPrompt ??
              userOptions.summaryPrompt ??
              DEFAULT_SUMMARY_PROMPT;

        const trimTokensToSummarize =
          runtimeContext?.trimTokensToSummarize ??
          runtimeContext?.trimTokenLimit ??
          userOptions.trimTokensToSummarize ??
          DEFAULT_TRIM_TOKEN_LIMIT;

        ensureMessageIds(state.messages);

        const tokenCounter =
          runtimeContext?.tokenCounter !== undefined
            ? runtimeContext.tokenCounter
            : userOptions.tokenCounter ?? countTokensApproximately;

        const totalTokens = await tokenCounter(state.messages);
        const doSummarize = await shouldSummarize(
          state.messages,
          totalTokens,
          triggerConditions,
          model
        );

        if (!doSummarize) {
          return;
        }

        const { systemPrompt, conversationMessages } = splitSystemMessage(
          state.messages
        );
        const cutoffIndex = await determineCutoffIndex(
          conversationMessages,
          validatedKeep,
          tokenCounter,
          model
        );

        if (cutoffIndex <= 0) {
          return;
        }

        const configurable: TAgentRunnableConfigurable = runtime.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
        return await this.commandBus.execute(new WrapWorkflowNodeExecutionCommand(async () => {
          const { messagesToSummarize, preservedMessages } = partitionMessages(
            systemPrompt,
            conversationMessages,
            cutoffIndex
          );

          const summary = await createSummary(
            messagesToSummarize,
            model,
            summaryPrompt,
            tokenCounter,
            trimTokensToSummarize
          );

          const prefix =
            runtimeContext?.summaryPrefix ??
            userOptions.summaryPrefix ??
            "Here is a summary of the conversation to date:";

          const summaryMessage = new HumanMessage({
            content: `${prefix}\n\n${summary}`,
            id: uuid(),
          });

          return {
            state: {
              summary: summaryMessage.content,
              messages: [
                new RemoveMessage({ id: REMOVE_ALL_MESSAGES }),
                summaryMessage,
                ...preservedMessages,
              ],
            }
          };
        }, {
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
      }
    } as AgentMiddleware
  }
}

function ensureMessageIds(messages: BaseMessage[]): void {
  for (const msg of messages) {
    if (!msg.id) {
      msg.id = uuid();
    }
  }
}

function splitSystemMessage(messages: BaseMessage[]): {
  systemPrompt?: SystemMessage;
  conversationMessages: BaseMessage[];
} {
  if (messages.length > 0 && isSystemMessage(messages[0])) {
    return {
      systemPrompt: messages[0] as SystemMessage,
      conversationMessages: messages.slice(1),
    };
  }
  return {
    conversationMessages: messages,
  };
}

function partitionMessages(
  systemPrompt: SystemMessage | undefined,
  conversationMessages: BaseMessage[],
  cutoffIndex: number
): { messagesToSummarize: BaseMessage[]; preservedMessages: BaseMessage[] } {
  const messagesToSummarize = conversationMessages.slice(0, cutoffIndex);
  const preservedMessages = conversationMessages.slice(cutoffIndex);

  if (systemPrompt) {
    messagesToSummarize.unshift(systemPrompt);
  }

  return { messagesToSummarize, preservedMessages };
}

async function shouldSummarize(
  messages: BaseMessage[],
  totalTokens: number,
  triggerConditions: ContextSize[],
  model: BaseLanguageModel
): Promise<boolean> {
  if (triggerConditions.length === 0) {
    return false;
  }

  for (const trigger of triggerConditions) {
    let conditionMet = true;
    let hasAnyProperty = false;

    if (trigger.messages !== undefined) {
      hasAnyProperty = true;
      if (messages.length < trigger.messages) {
        conditionMet = false;
      }
    }

    if (trigger.tokens !== undefined) {
      hasAnyProperty = true;
      if (totalTokens < trigger.tokens) {
        conditionMet = false;
      }
    }

    if (trigger.fraction !== undefined) {
      hasAnyProperty = true;
      const maxInputTokens = getProfileLimits(model);
      if (typeof maxInputTokens === "number") {
        const threshold = Math.floor(maxInputTokens * trigger.fraction);
        if (totalTokens < threshold) {
          conditionMet = false;
        }
      } else {
        conditionMet = false;
      }
    }

    if (hasAnyProperty && conditionMet) {
      return true;
    }
  }

  return false;
}

/**
 * Determine cutoff index respecting retention configuration
 */
async function determineCutoffIndex(
  messages: BaseMessage[],
  keep: ContextSize,
  tokenCounter: TokenCounter,
  model: BaseLanguageModel
): Promise<number> {
  if ("tokens" in keep || "fraction" in keep) {
    const tokenBasedCutoff = await findTokenBasedCutoff(
      messages,
      keep,
      tokenCounter,
      model
    );
    if (typeof tokenBasedCutoff === "number") {
      return tokenBasedCutoff;
    }
    /**
     * Fallback to message count if token-based fails
     */
    return findSafeCutoff(messages, DEFAULT_MESSAGES_TO_KEEP);
  }
  /**
   * find cutoff index based on message count
   */
  return findSafeCutoff(messages, keep.messages ?? DEFAULT_MESSAGES_TO_KEEP);
}

async function findTokenBasedCutoff(
  messages: BaseMessage[],
  keep: ContextSize,
  tokenCounter: TokenCounter,
  model: BaseLanguageModel
): Promise<number | undefined> {
  if (messages.length === 0) {
    return 0;
  }

  let targetTokenCount: number;

  if ("fraction" in keep && keep.fraction !== undefined) {
    const maxInputTokens = getProfileLimits(model);
    if (typeof maxInputTokens !== "number") {
      return;
    }
    targetTokenCount = Math.floor(maxInputTokens * keep.fraction);
  } else if ("tokens" in keep && keep.tokens !== undefined) {
    targetTokenCount = Math.floor(keep.tokens);
  } else {
    return;
  }

  if (targetTokenCount <= 0) {
    targetTokenCount = 1;
  }

  const totalTokens = await tokenCounter(messages);
  if (totalTokens <= targetTokenCount) {
    return 0;
  }

  let left = 0;
  let right = messages.length;
  let cutoffCandidate = messages.length;
  const maxIterations = Math.floor(Math.log2(messages.length)) + 1;

  for (let i = 0; i < maxIterations; i++) {
    if (left >= right) {
      break;
    }

    const mid = Math.floor((left + right) / 2);
    const suffixTokens = await tokenCounter(messages.slice(mid));
    if (suffixTokens <= targetTokenCount) {
      cutoffCandidate = mid;
      right = mid;
    } else {
      left = mid + 1;
    }
  }

  if (cutoffCandidate === messages.length) {
    cutoffCandidate = left;
  }

  if (cutoffCandidate >= messages.length) {
    if (messages.length === 1) {
      return 0;
    }
    cutoffCandidate = messages.length - 1;
  }

  for (let i = cutoffCandidate; i >= 0; i--) {
    if (isSafeCutoffPoint(messages, i)) {
      return i;
    }
  }

  return 0;
}

/**
 * Find safe cutoff point that preserves AI/Tool message pairs
 */
function findSafeCutoff(
  messages: BaseMessage[],
  messagesToKeep: number
): number {
  if (messages.length <= messagesToKeep) {
    return 0;
  }

  const targetCutoff = messages.length - messagesToKeep;

  for (let i = targetCutoff; i >= 0; i--) {
    if (isSafeCutoffPoint(messages, i)) {
      return i;
    }
  }

  return 0;
}

/**
 * Check if cutting at index would separate AI/Tool message pairs
 */
function isSafeCutoffPoint(
  messages: BaseMessage[],
  cutoffIndex: number
): boolean {
  if (cutoffIndex >= messages.length) {
    return true;
  }

  /**
   * Prevent preserved messages from starting with AI message containing tool calls
   */
  if (
    cutoffIndex < messages.length &&
    isAIMessage(messages[cutoffIndex]) &&
    hasToolCalls(messages[cutoffIndex])
  ) {
    return false;
  }

  const searchStart = Math.max(0, cutoffIndex - SEARCH_RANGE_FOR_TOOL_PAIRS);
  const searchEnd = Math.min(
    messages.length,
    cutoffIndex + SEARCH_RANGE_FOR_TOOL_PAIRS
  );

  for (let i = searchStart; i < searchEnd; i++) {
    if (!hasToolCalls(messages[i])) {
      continue;
    }

    const toolCallIds = extractToolCallIds(messages[i] as AIMessage);
    if (cutoffSeparatesToolPair(messages, i, cutoffIndex, toolCallIds)) {
      return false;
    }
  }

  return true;
}

/**
 * Extract tool call IDs from an AI message
 */
function extractToolCallIds(aiMessage: AIMessage): Set<string> {
  const toolCallIds = new Set<string>();
  if (aiMessage.tool_calls) {
    for (const toolCall of aiMessage.tool_calls) {
      const id =
        typeof toolCall === "object" && "id" in toolCall ? toolCall.id : null;
      if (id) {
        toolCallIds.add(id);
      }
    }
  }
  return toolCallIds;
}

/**
 * Check if cutoff separates an AI message from its corresponding tool messages
 */
function cutoffSeparatesToolPair(
  messages: BaseMessage[],
  aiMessageIndex: number,
  cutoffIndex: number,
  toolCallIds: Set<string>
): boolean {
  for (let j = aiMessageIndex + 1; j < messages.length; j++) {
    const message = messages[j];
    if (
      ToolMessage.isInstance(message) &&
      toolCallIds.has(message.tool_call_id)
    ) {
      const aiBeforeCutoff = aiMessageIndex < cutoffIndex;
      const toolBeforeCutoff = j < cutoffIndex;
      if (aiBeforeCutoff !== toolBeforeCutoff) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Generate summary for the given messages
 */
async function createSummary(
  messagesToSummarize: BaseMessage[],
  model: BaseLanguageModel,
  summaryPrompt: string,
  tokenCounter: TokenCounter,
  trimTokensToSummarize: number | undefined
): Promise<string> {
  if (!messagesToSummarize.length) {
    return "No previous conversation history.";
  }

  const trimmedMessages = await trimMessagesForSummary(
    messagesToSummarize,
    tokenCounter,
    trimTokensToSummarize
  );

  if (!trimmedMessages.length) {
    return "Previous conversation was too long to summarize.";
  }

  try {
    const formattedPrompt = summaryPrompt.replace(
      "{messages}",
      JSON.stringify(trimmedMessages, null, 2)
    );
    const response = await model.invoke(formattedPrompt);
    const content = response.content;
    if (typeof content === "string") {
      return content.trim();
    } else if (Array.isArray(content)) {
      const textContent = content
        .map((item) => {
          if (typeof item === "string") return item;
          if (typeof item === "object" && item !== null && "text" in item) {
            return (item as { text: string }).text;
          }
          return "";
        })
        .join("");
      return textContent.trim();
    }
    return "Error generating summary: Invalid response format";
  } catch (e) {
    return `Error generating summary: ${e}`;
  }
}

/**
 * Trim messages to fit within summary generation limits
 */
async function trimMessagesForSummary(
  messages: BaseMessage[],
  tokenCounter: TokenCounter,
  trimTokensToSummarize: number | undefined
): Promise<BaseMessage[]> {
  if (trimTokensToSummarize === undefined) {
    return messages;
  }

  try {
    return await trimMessages(messages, {
      maxTokens: trimTokensToSummarize,
      tokenCounter: async (msgs) => tokenCounter(msgs),
      strategy: "last",
      allowPartial: true,
      includeSystem: true,
    });
  } catch {
    /**
     * Fallback to last N messages if trimming fails
     */
    return messages.slice(-DEFAULT_FALLBACK_MESSAGE_COUNT);
  }
}