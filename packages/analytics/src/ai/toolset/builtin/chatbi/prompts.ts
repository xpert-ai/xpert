export const TOOL_CHATBI_PROMPTS_DEFAULT = 
    '1. Call `get_cube_context` to get the cube context information if you do not have the model\'s dimensions and measures info, then proceed based on that information.\n' +
    '2. Use the `answer_question` tool to reply to the user with the analysis results.\n' +
    '3. Call `show_indicators` to display indicator data only when the user explicitly wants to display certain indicators. Try NOT to call tools.\n' +
    '4. If the cube context does not have the required measure or indicators, you can use the `calculated_members` parameter of the `answer_question` tool to supplement it and use its name in `measures`.\n' +
    '  For example, if you want to calculate the month-on-month sales growth rate and the existing information does not meet the requirements, you can use the following parameters:\n' +
`  {
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
        "measure": "MoM_Growth_Rate",
        "shapeType": "line"
      }
    ]
  }\n` +
`5. The syntax of the mdx query statement has the following restrictions:：
    - The same dimension cannot appear on any two axes of columns and rows slicers at the same time. If you need to limit dimension members on columns or rows, you can use functions such as descendants.。
\n` + 
`6. Finally, there is no need to generate a data:image/png;base64 image, as the data graphics are already displayed to the user in the tool.`
