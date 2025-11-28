import { WorkflowAssignerNodeStrategy, WorkflowAssignerNodeValidator } from "./assigner"
import { WorkflowJSONParseNodeStrategy, WorkflowJSONParseNodeValidator } from "./json-parse"
import { WorkflowJSONStringifyNodeStrategy, WorkflowJSONStringifyNodeValidator } from "./json-stringify"
import { WorkflowListOperatorNodeStrategy, WorkflowListOperatorNodeValidator } from "./list-operator"
import { WorkflowMiddlewareNodeStrategy, WorkflowMiddlewareNodeValidator } from "./middleware"
import { WorkflowSkillNodeStrategy, WorkflowSkillNodeValidator } from "./skill"
import { SkillsMiddleware } from "./skills-middleware"
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
    WorkflowListOperatorNodeStrategy,
    WorkflowVariableAggregatorNodeStrategy,
    WorkflowAssignerNodeStrategy,
    WorkflowJSONStringifyNodeStrategy,
    WorkflowJSONParseNodeStrategy,
    WorkflowSkillNodeStrategy,
    WorkflowMiddlewareNodeStrategy,

    SkillsMiddleware
]