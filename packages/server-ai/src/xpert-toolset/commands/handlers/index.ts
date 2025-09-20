import { CreateToolsetHandler } from "./create-toolset.handler";
import { ToolsetGetToolsHandler } from "./get-tools.handler";
import { MCPToolsBySchemaHandler } from "./mcp-tools-schema.handler";
import { ParserODataSchemaHandler } from "./parser-odata-schema.handler";
import { ParserOpenAPISchemaHandler } from "./parser-openapi-schema.handler";

export const CommandHandlers = [
    ToolsetGetToolsHandler, 
    ParserOpenAPISchemaHandler, 
    ParserODataSchemaHandler,
    MCPToolsBySchemaHandler,
    CreateToolsetHandler
]
