import { AIModelGetIconHandler } from "./get-model-icon.handler";
import { AIModelGetProviderHandler } from "./get-provider.handler";
import { ListBuiltinModelsHandler } from "./list-builtin-models.handler";
import { ListModelProvidersHandler } from "./list-providers.handler";

export const QueryHandlers = [
	AIModelGetIconHandler,
	ListModelProvidersHandler,
	ListBuiltinModelsHandler,
	AIModelGetProviderHandler
];
