import { WorkflowAssignerNodeStrategy, WorkflowAssignerNodeValidator } from "./assigner"
import { WorkflowJSONParseNodeStrategy, WorkflowJSONParseNodeValidator } from "./json-parse"
import { WorkflowJSONStringifyNodeStrategy, WorkflowJSONStringifyNodeValidator } from "./json-stringify"
import { WorkflowListOperatorNodeStrategy, WorkflowListOperatorNodeValidator } from "./list-operator"
import { WorkflowVariableAggregatorNodeStrategy, WorkflowVariableAggregatorNodeValidator } from "./variable-aggregator"

export const Validators = [
    WorkflowListOperatorNodeValidator,
    WorkflowVariableAggregatorNodeValidator,
    WorkflowAssignerNodeValidator,
    WorkflowJSONStringifyNodeValidator,
    WorkflowJSONParseNodeValidator
]

export const Strategies = [
    WorkflowListOperatorNodeStrategy,
    WorkflowVariableAggregatorNodeStrategy,
    WorkflowAssignerNodeStrategy,
    WorkflowJSONStringifyNodeStrategy,
    WorkflowJSONParseNodeStrategy
]