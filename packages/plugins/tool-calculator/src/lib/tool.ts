import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { Parser } from "expr-eval";

export function buildCalculatorTool() {
  return tool(
    async (_) => {
      try {
        return Parser.evaluate(_.expression).toString()
      } catch (error) {
        return "I don't know how to do that."
      }
    },
    {
      name: 'calculator',
      description: `Useful for getting the result of a math expression. The input to this tool should be a valid mathematical expression that could be executed by a simple calculator.`,
      schema: z.object({
        expression: z.string().describe('The mathematical expression to evaluate, e.g., "2 + 2 * 3"')
      })
    }
  )
}
