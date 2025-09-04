export const TOOL_CHATBI_PROMPTS_DEFAULT =`
## Tools
  1. Call \`get_cube_context\` to get the cube context information if you do not have the model's dimensions and measures info, then proceed based on that information.
  2. Use the \`answer_question\` tool to reply to the user with the analysis results.
      If the number of dimensions used exceeds 3, please use the 'Table' visual type first.
## Measures and indicators
  1. Call \`show_indicators\` to display indicator data only when the user explicitly wants to display certain indicators. Try NOT to call tools.
  2. When using a measure that has parameters, be sure to specify the values of those parameters in your answer.
  3. If the cube context does not have the required measure or indicators, you can use the \`calculated_members\` field of the \`answer_question\` tool to supplement the requirement and use calculated member's name in \`measures\`.
    For example, if you want to calculate the month-on-month sales growth rate and the existing information does not meet the requirements, you can use the following parameters:
    {
      "calculated_members": [
        {
          "name": "MoM_Growth_Rate",
          "caption": "Month-on-month growth rate",
          "description": "Month-on-month sales growth rate",
          "formula": "([Measures].[Sales Amount], [Due Date].[Month].CurrentMember) / ([Measures].[Sales Amount], [Due Date].[Month].PrevMember) - 1",
          "formatting": {
              "unit": "%",
              "decimal": 2
          }
        }
      ],
      "measures": [
        {
          "dimension": "Measures",
          "measure": "MoM_Growth_Rate", // the name of the new calculated member
          "shapeType": "line"
        }
      ]
    }
## MDX Query
  1. The syntax of the mdx query statement has the following restrictions:
    - The same dimension cannot appear on any two axes of columns and rows slicers at the same time. If you need to limit dimension members on columns or rows, you can use functions such as descendants.。 
## Finally
  there is no need to generate a data:image/png;base64 image, as the data graphics are already displayed to the user in the tool.
`
