import { GetODataRemoteMetadataHandler } from './get-odata-remote-metadata.handler'
import { GetOpenAPIRemoteSchemaHandler } from './get-openapi-remote-schema.handler'
import { ToolProviderIconHandler } from './get-provider-icon.handler'
import { ListBuiltinCredentialsSchemaHandler } from './list-builtin-credentials-schema.handler'
import { ListBuiltinToolProvidersHandler } from './list-builtin-providers.handler'
import { ListBuiltinToolsHandler } from './list-builtin-tools.handler'
import { FindXpertToolsetsHandler } from './toolset-find.handler'
import { ResolveCapabilityToolsetsHandler } from './resolve-capability-toolsets.handler'

export const QueryHandlers = [
    ResolveCapabilityToolsetsHandler,
    FindXpertToolsetsHandler,
    ListBuiltinToolProvidersHandler,
    ToolProviderIconHandler,
    ListBuiltinToolsHandler,
    ListBuiltinCredentialsSchemaHandler,
    GetODataRemoteMetadataHandler,
    GetOpenAPIRemoteSchemaHandler
]
