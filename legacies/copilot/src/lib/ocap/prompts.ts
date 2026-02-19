export function createAgentStepsInstructions(...steps: string[]) {
    return `Use the following steps to perform user input:
${steps.map((step, index) => `Step ${index + 1} - ${step};`).join('\n')}
`
}