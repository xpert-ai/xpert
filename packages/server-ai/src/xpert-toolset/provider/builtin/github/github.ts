import { IXpertToolset, TToolCredentials } from "@metad/contracts";
import { BuiltinToolset } from "../builtin-toolset";

export class GithubToolset extends BuiltinToolset {
    static provider = 'github'

    constructor(protected toolset?: IXpertToolset) {
        super(GithubToolset.provider, toolset)
        if (toolset?.tools) {
            this.tools = [
            ]
        }
    }

    _validateCredentials(credentials: TToolCredentials): Promise<void> {
        throw new Error("Method not implemented.");
    }
}
