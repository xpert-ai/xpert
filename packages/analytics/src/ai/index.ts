import { BUILTIN_TOOLSET_REPOSITORY } from "@metad/server-ai";
import { ChatBIToolset, ChatDBToolset } from "./toolset/builtin";

BUILTIN_TOOLSET_REPOSITORY.push({
    baseUrl: `packages/analytics/src/ai/toolset/builtin`,
    providers: [
        ChatDBToolset,
        ChatBIToolset
    ]
})

export { ChatDBToolset, ChatBIToolset }