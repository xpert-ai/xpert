import { isToolEnabled, IXpertToolset, TToolCredentials } from '@xpert-ai/contracts'
import { getErrorMessage, omit } from '@xpert-ai/server-common'
import { ToolProviderCredentialValidationError } from '../../../errors'
import { BuiltinToolset, TBuiltinToolsetParams } from '../builtin-toolset'
import { SerplySearch } from './tools/serply-search'

export class SerplyToolset extends BuiltinToolset {
    static provider = 'serply'

    constructor(
        protected toolset?: IXpertToolset,
        params?: TBuiltinToolsetParams
    ) {
        super(SerplyToolset.provider, toolset, params)
    }

    async initTools() {
        this.tools ??= []
        const disableToolDefault = false
        if (!this.toolset.credentials?.serply_api_key) {
            throw new ToolProviderCredentialValidationError(`Credential 'serply_api_key' not provided`)
        }
        this.toolset.tools
            .filter((_) => isToolEnabled(_, disableToolDefault))
            .forEach((tool) => {
                if (tool.name === SerplySearch.lc_name()) {
                    const serplySearchTool = new SerplySearch({
                        ...omit(this.toolset.credentials, 'serply_api_key'),
                        serplyApiKey: this.toolset.credentials.serply_api_key as string
                    })
                    // Overwrite tool name
                    serplySearchTool.name = tool.name
                    this.tools.push(serplySearchTool)
                }
            })

        return this.tools
    }

    async _validateCredentials(credentials: TToolCredentials) {
        try {
            const serplySearch = new SerplySearch({
                serplyApiKey: credentials.serply_api_key as string,
                num: 1
            })

            await serplySearch.invoke({
                query: 'XpertAI'
            })
        } catch (e) {
            throw new ToolProviderCredentialValidationError(getErrorMessage(e))
        }
    }
}
