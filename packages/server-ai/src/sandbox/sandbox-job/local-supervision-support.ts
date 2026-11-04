/** Jobs require descendant-exit evidence; an ordinary process-group exit is insufficient. */
export function localSupervisionFailure(platform: NodeJS.Platform = process.platform): string | undefined {
    if (platform !== 'linux')
        return `Local Sandbox Jobs cannot confirm descendant exit on ${platform}; use a healthy Linux Runtime Provider with execution control.`
    return undefined
}
