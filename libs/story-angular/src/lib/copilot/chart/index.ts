import { CopilotCommand } from "@xpert-ai/copilot";
import { editChartWidgetCommand } from "./chat";

export const ChartCommand = {
    name: 'chart',
    description: 'Edit chart attributes of widget',
    examples: [
      'change to doughnut chart with rounded corner item'
    ],
    processor: editChartWidgetCommand
} as CopilotCommand