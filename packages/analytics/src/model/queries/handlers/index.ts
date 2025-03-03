import { ModelCubeQueryHandler } from './cube-query.handler'
import { ModelQueryHandler } from './my-model-query.handler'
import { ModelOlapQueryHandler } from './olap-query.handler'

export const QueryHandlers = [
    ModelQueryHandler,
    ModelOlapQueryHandler,
    ModelCubeQueryHandler
]
