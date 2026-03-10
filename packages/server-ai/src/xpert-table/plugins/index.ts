import { WorkflowDBInsertNodeStrategy, WorkflowDBInsertNodeValidator } from './insert/index'
import { WorkflowDBSQLNodeStrategy, WorkflowDBSqlNodeValidator } from './sql'
import { WorkflowDBUpdateNodeStrategy } from './update/strategy'
import { WorkflowDBDeleteNodeStrategy } from './delete/strategy'
import { WorkflowDBQueryNodeStrategy } from './query/strategy'

export const Validators = [
    WorkflowDBInsertNodeValidator,
    WorkflowDBSqlNodeValidator
]

export const Strategies = [
    WorkflowDBInsertNodeStrategy,
    WorkflowDBSQLNodeStrategy,
    WorkflowDBUpdateNodeStrategy,
    WorkflowDBDeleteNodeStrategy,
    WorkflowDBQueryNodeStrategy
]