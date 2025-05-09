import { ModelCubeQueryHandler } from './cube-query.handler'
import { GetOnePublicSemanticModelHandler } from './get-public-one.handler'
import { ModelQueryHandler } from './my-model-query.handler'
import { ModelOlapQueryHandler } from './olap-query.handler'

export const QueryHandlers = [
    ModelQueryHandler,
    ModelOlapQueryHandler,
    ModelCubeQueryHandler,
    GetOnePublicSemanticModelHandler
]
