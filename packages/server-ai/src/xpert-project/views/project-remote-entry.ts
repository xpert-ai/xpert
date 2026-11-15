import { builtinRemoteEntry } from '../../view-extension/builtin-remote-entry'

export function projectRemoteEntry(component: string, title: string) {
    return builtinRemoteEntry(__dirname, component, title)
}
