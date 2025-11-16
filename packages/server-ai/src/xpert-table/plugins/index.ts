import { WorkflowDBInsertNodeStrategy, WorkflowDBInsertNodeValidator } from './insert/index'
import { WorkflowDBSQLNodeStrategy, WorkflowDBSqlNodeValidator } from './sql'

export const Validators = [
    WorkflowDBInsertNodeValidator,
    WorkflowDBSqlNodeValidator
]

export const Strategies = [
    WorkflowDBInsertNodeStrategy,
    WorkflowDBSQLNodeStrategy
]