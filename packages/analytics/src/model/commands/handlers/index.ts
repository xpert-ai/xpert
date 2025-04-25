import { SemanticModelQueryHandler } from './model-query.handler'
import { SemanticModelPublishHandler } from './publish.handler'
import { SemanticModelCacheDeleteHandler } from './semantic-model-cache.delete.handler'
import { SemanticModelCreateHandler } from './semantic-model.create.handler'
import { SemanticModelUpdateHandler } from './semantic-model.update.handler'

export const CommandHandlers = [
	SemanticModelUpdateHandler,
	SemanticModelCacheDeleteHandler,
	SemanticModelCreateHandler,
	SemanticModelQueryHandler,
	SemanticModelPublishHandler
]
