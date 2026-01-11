import { WorkflowAssignerNodeStrategy, WorkflowAssignerNodeValidator } from "./assigner"
import { WorkflowIteratingNodeStrategy } from "./iterating"
import { WorkflowJSONParseNodeStrategy, WorkflowJSONParseNodeValidator } from "./json-parse"
import { WorkflowJSONStringifyNodeStrategy, WorkflowJSONStringifyNodeValidator } from "./json-stringify"
import { WorkflowListOperatorNodeStrategy, WorkflowListOperatorNodeValidator } from "./list-operator"
import { WorkflowMiddlewareNodeStrategy, WorkflowMiddlewareNodeValidator } from "./middleware"
import { WorkflowSkillNodeStrategy, WorkflowSkillNodeValidator } from "./skill"
import { WorkflowVariableAggregatorNodeStrategy, WorkflowVariableAggregatorNodeValidator } from "./variable-aggregator"

export const Validators = [
    WorkflowListOperatorNodeValidator,
    WorkflowVariableAggregatorNodeValidator,
    WorkflowAssignerNodeValidator,
    WorkflowJSONStringifyNodeValidator,
    WorkflowJSONParseNodeValidator,
    WorkflowMiddlewareNodeValidator,
    WorkflowSkillNodeValidator
]

export const Strategies = [
    WorkflowIteratingNodeStrategy,
    WorkflowListOperatorNodeStrategy,
    WorkflowVariableAggregatorNodeStrategy,
    WorkflowAssignerNodeStrategy,
    WorkflowJSONStringifyNodeStrategy,
    WorkflowJSONParseNodeStrategy,
    WorkflowSkillNodeStrategy,
    WorkflowMiddlewareNodeStrategy,
]