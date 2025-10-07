import { WorkflowAssignerNodeStrategy, WorkflowAssignerNodeValidator } from "./assigner"
import { WorkflowListOperatorNodeStrategy, WorkflowListOperatorNodeValidator } from "./list-operator"
import { WorkflowVariableAggregatorNodeStrategy, WorkflowVariableAggregatorNodeValidator } from "./variable-aggregator"

export const Validators = [
    WorkflowListOperatorNodeValidator,
    WorkflowVariableAggregatorNodeValidator,
    WorkflowAssignerNodeValidator
]

export const Strategies = [
    WorkflowListOperatorNodeStrategy,
    WorkflowVariableAggregatorNodeStrategy,
    WorkflowAssignerNodeStrategy
]