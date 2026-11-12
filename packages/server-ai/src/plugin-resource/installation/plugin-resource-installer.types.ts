import { IXpert, PluginResourceComponentSelector, XpertPluginMcpServerPolicy } from '@xpert-ai/contracts'
import { PluginBundleComponentRegistration } from '@xpert-ai/server-core'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { PluginResourceInstallation } from '../plugin-resource-installation.entity'
export type PluginResourceInstallComponent = PluginResourceComponentSelector & {
    targetAgentKey?: string
    policyOverrides?: XpertPluginMcpServerPolicy
    events?: string[]
    auth?: 'on_install' | 'on_first_use'
}

export type PluginResourceInstallResult = {
    installations: PluginResourceInstallation[]
    xpert?: IXpert
    pendingAuth: PluginResourceInstallation[]
}

export type RuntimeComponent = {
    runtimeSource?: 'agent-plugin'
    /** Host-resolved portable server, including an authorized Connector reference, never credentials. */
    portableServer?: import('@xpert-ai/contracts').TMCPServer
    pluginName: string
    pluginVersion?: string
    component: PluginBundleComponentRegistration
    /** Native registry providers have no portable filesystem root. */
    rootDir: string | null
    targetAgentKey?: string
    policyOverrides?: XpertPluginMcpServerPolicy
    events?: string[]
    auth?: 'on_install' | 'on_first_use'
}

export type RegisteredRuntimeToolProviderInstallation = {
    installation: PluginResourceInstallation
    previousInstallation: PluginResourceInstallation | null
    previousToolset: XpertToolset | null
}
