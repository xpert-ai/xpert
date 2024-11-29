import { IXpertToolset, TToolCredentials } from "@metad/contracts";
import { BuiltinToolset } from "../builtin-toolset";

export class SlackToolset extends BuiltinToolset {
    static provider = 'slack'

    constructor(protected toolset?: IXpertToolset) {
        super(SlackToolset.provider, toolset)
        if (toolset?.tools) {
            this.tools = [
            ]
        }
    }

    _validateCredentials(credentials: TToolCredentials): Promise<void> {
        throw new Error("Method not implemented.");
    }
}
