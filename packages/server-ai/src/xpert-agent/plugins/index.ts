import {
    WorkflowAgentToolNodeStrategy,
    WorkflowAgentWorkflowValidator,
    WorkflowAgentWorkflowNodeStrategy
} from './agent-tool'
import { WorkflowAssignerNodeStrategy, WorkflowAssignerNodeValidator } from './assigner'
import { WorkflowIteratorNodeStrategy, WorkflowIteratorNodeValidator } from './iterator'
import { WorkflowJSONParseNodeStrategy, WorkflowJSONParseNodeValidator } from './json-parse'
import { WorkflowJSONStringifyNodeStrategy, WorkflowJSONStringifyNodeValidator } from './json-stringify'
import { WorkflowListOperatorNodeStrategy, WorkflowListOperatorNodeValidator } from './list-operator'
import { WorkflowMiddlewareNodeStrategy, WorkflowMiddlewareNodeValidator } from './middleware'
import { WorkflowSkillNodeStrategy, WorkflowSkillNodeValidator } from './skill'
import { WorkflowStartNodeStrategy } from './start'
import { WorkflowVariableAggregatorNodeStrategy, WorkflowVariableAggregatorNodeValidator } from './variable-aggregator'

export const Validators = [
    WorkflowAgentWorkflowValidator,
    WorkflowListOperatorNodeValidator,
    WorkflowVariableAggregatorNodeValidator,
    WorkflowAssignerNodeValidator,
    WorkflowJSONStringifyNodeValidator,
    WorkflowJSONParseNodeValidator,
    WorkflowMiddlewareNodeValidator,
    WorkflowSkillNodeValidator,
    WorkflowIteratorNodeValidator
]

export const Strategies = [
    WorkflowStartNodeStrategy,
    WorkflowAgentWorkflowNodeStrategy,
    WorkflowAgentToolNodeStrategy,
    WorkflowIteratorNodeStrategy,
    WorkflowListOperatorNodeStrategy,
    WorkflowVariableAggregatorNodeStrategy,
    WorkflowAssignerNodeStrategy,
    WorkflowJSONStringifyNodeStrategy,
    WorkflowJSONParseNodeStrategy,
    WorkflowSkillNodeStrategy,
    WorkflowMiddlewareNodeStrategy
]
