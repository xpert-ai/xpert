import { IEnvironment } from "@metad/contracts";

export function toEnvState(env: IEnvironment) {
    return env && {
        env:
            env.variables?.reduce((state, variable) => {
                state[variable.name] = variable.value
                return state
            }, {}) ?? {}
    }
}