import type { IXpertAgentExecution } from '@xpert-ai/contracts'

type Execution = Partial<IXpertAgentExecution> & { parent?: IXpertAgentExecution }

/** Keep provider accounting on the server, including on nested historical executions. */
export function publicExecution(execution: Execution): Execution {
    const {
        usageSummary,
        totalPrice,
        currency,
        inputUnitPrice,
        inputPriceUnit,
        outputUnitPrice,
        outputPriceUnit,
        ...summary
    } = execution
    if (summary.subExecutions) {
        summary.subExecutions = summary.subExecutions.map(publicExecution)
    }
    if (summary.parent) summary.parent = publicExecution(summary.parent)
    if (summary.runningExecution) summary.runningExecution = publicExecution(summary.runningExecution)
    return summary
}
