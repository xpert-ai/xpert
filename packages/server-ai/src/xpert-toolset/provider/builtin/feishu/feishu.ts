import { IXpertToolset, TToolCredentials } from "@metad/contracts";
import { BuiltinToolset } from "../builtin-toolset";

export class FeishuToolset extends BuiltinToolset {
    static provider = 'feishu'

    constructor(protected toolset?: IXpertToolset) {
        super(FeishuToolset.provider, toolset)
        if (toolset?.tools) {
            this.tools = [
            ]
        }
    }

    _validateCredentials(credentials: TToolCredentials): Promise<void> {
        throw new Error("Method not implemented.");
    }
}
