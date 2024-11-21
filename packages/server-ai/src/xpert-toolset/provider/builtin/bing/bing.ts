import { IXpertToolset, TToolCredentials } from "@metad/contracts";
import { BuiltinToolset } from "../builtin-toolset";

export class BingToolset extends BuiltinToolset {
    static provider = 'bing'

    constructor(protected toolset?: IXpertToolset) {
        super(BingToolset.provider, toolset)
    }

    _validateCredentials(credentials: TToolCredentials): Promise<void> {
        throw new Error("Method not implemented.");
    }
}
