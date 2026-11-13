import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { StructuredTool, ToolRunnableConfig } from '@langchain/core/tools'
import { InferInteropZodOutput } from '@langchain/core/utils/types'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory, getToolCallFromConfig } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { z } from 'zod/v3'

// Keys are created at https://serply.io and the API is described at https://serply.io/docs
const SERPLY_SEARCH_URL = 'https://api.serply.io/v1/search'
const SERPLY_USER_AGENT = 'xpert'

export type SerplySearchParams = {
    /**
     * The API key used for authentication with the Serply API.
     */
    serplyApiKey: string
    /**
     * The number of results to return, from 1 to 10.
     *
     * @default 10
     */
    num?: number | string
    /**
     * Two-letter country code of the search, for example `US`.
     */
    gl?: string
    /**
     * Interface language of the search, for example `en`.
     */
    hl?: string
}

export type SerplySearchResult = {
    title: string
    url: string
    content: string
}

const inputSchema = z.object({
    query: z.string().describe('The search query')
})

function isSerplyResult(value: unknown): value is { title: string; link: string; description?: unknown } {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof Reflect.get(value, 'title') === 'string' &&
        typeof Reflect.get(value, 'link') === 'string'
    )
}

function parseResults(body: unknown): SerplySearchResult[] {
    if (typeof body !== 'object' || body === null) {
        return []
    }
    const results = Reflect.get(body, 'results')
    if (!Array.isArray(results)) {
        return []
    }
    return results.filter(isSerplyResult).map((result) => ({
        title: result.title,
        url: result.link,
        content: typeof result.description === 'string' ? result.description : ''
    }))
}

export class SerplySearch extends StructuredTool {
    static lc_name() {
        return 'serply_search'
    }

    name = SerplySearch.lc_name()

    description =
        'A search engine backed by Google results. Useful for when you need to answer questions about current events. Input should be a search query.'

    schema = inputSchema

    private readonly apiKey: string
    private readonly num?: number
    private readonly gl?: string
    private readonly hl?: string

    constructor(params: SerplySearchParams) {
        super()

        if (!params.serplyApiKey) {
            throw new Error('Serply requires an API key. Create one at https://serply.io')
        }

        this.apiKey = params.serplyApiKey
        const num = Number(params.num)
        this.num = Number.isInteger(num) && num > 0 ? num : undefined
        this.gl = params.gl || undefined
        this.hl = params.hl || undefined
    }

    protected buildUrl(query: string): string {
        const searchParams = new URLSearchParams({ q: query })
        if (this.num) {
            searchParams.set('num', String(this.num))
        }
        if (this.gl) {
            searchParams.set('gl', this.gl)
        }
        if (this.hl) {
            searchParams.set('hl', this.hl)
        }
        return `${SERPLY_SEARCH_URL}?${searchParams}`
    }

    async _call(
        input: InferInteropZodOutput<typeof inputSchema>,
        _runManager?: CallbackManagerForToolRun,
        parentConfig?: ToolRunnableConfig
    ): Promise<SerplySearchResult[]> {
        const response = await fetch(this.buildUrl(input.query), {
            headers: {
                'X-Api-Key': this.apiKey,
                'User-Agent': SERPLY_USER_AGENT
            }
        })

        if (!response.ok) {
            throw new Error(`Failed to load search results from Serply: HTTP ${response.status}`)
        }

        const results = parseResults(await response.json())

        const toolCall = getToolCallFromConfig(parentConfig)
        // Tool message event
        dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
            id: toolCall?.id,
            category: 'Computer',
            type: ChatMessageStepCategory.WebSearch,
            toolset: 'serply',
            tool: this.name,
            title: t('server-ai:Tools.SerplySearch.WebSearch'),
            message: input.query,
            data: results
        }).catch((err) => {
            console.error(err)
        })

        return results
    }
}
