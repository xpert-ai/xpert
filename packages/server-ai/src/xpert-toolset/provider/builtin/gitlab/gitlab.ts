import { IXpertToolset, TToolCredentials } from "@metad/contracts";
import { BuiltinToolset } from "../builtin-toolset";

export class GitlabToolset extends BuiltinToolset {
    static provider = 'gitlab'

    constructor(protected toolset?: IXpertToolset) {
        super(GitlabToolset.provider, toolset)
        if (toolset?.tools) {
            this.tools = [
            ]
        }
    }

    _validateCredentials(credentials: TToolCredentials): Promise<void> {
        throw new Error("Method not implemented.");
    }
}
