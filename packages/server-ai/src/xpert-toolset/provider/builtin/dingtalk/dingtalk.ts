import { IXpertToolset, TToolCredentials } from "@metad/contracts";
import { BuiltinToolset } from "../builtin-toolset";

export class DingTalkToolset extends BuiltinToolset {
    static provider = 'dingtalk'

    constructor(protected toolset?: IXpertToolset) {
        super(DingTalkToolset.provider, toolset)
        if (toolset?.tools) {
            this.tools = [
            ]
        }
    }

    _validateCredentials(credentials: TToolCredentials): Promise<void> {
        throw new Error("Method not implemented.");
    }
}
