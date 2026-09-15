// The current SDK matcher requires every {?query} variable. Keep optional reads and subscriptions consistent.
import { UriTemplate } from '@modelcontextprotocol/server'

export class McpResourceUriTemplate extends UriTemplate {
    private readonly pathTemplate?: UriTemplate
    private readonly queryNames?: ReadonlySet<string>

    constructor(template: string) {
        super(template)
        const query = /^(.*)\{\?([A-Za-z_]\w*(?:,[A-Za-z_]\w*)*)\}$/.exec(template)
        if (query && !query[1].includes('?') && !query[1].includes('#')) {
            this.pathTemplate = new UriTemplate(query[1])
            this.queryNames = new Set(query[2].split(','))
        }
    }

    override match(uri: string): ReturnType<UriTemplate['match']> {
        if (!this.pathTemplate || !this.queryNames) return super.match(uri)
        if (uri.length > 4096 || uri.includes('#') || /%(?![\da-f]{2})/i.test(uri)) return null
        const queryIndex = uri.indexOf('?')
        const path = queryIndex < 0 ? uri : uri.slice(0, queryIndex)
        const variables = this.pathTemplate.match(path)
        if (!variables) return null
        const parameters = new URLSearchParams(queryIndex < 0 ? '' : uri.slice(queryIndex + 1))
        const seen = new Set<string>()
        for (const [name, value] of parameters) {
            if (!this.queryNames.has(name) || seen.has(name) || name in variables || !value) return null
            seen.add(name)
            variables[name] = value
        }
        return variables
    }
}
