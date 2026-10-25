import type { IXpert, TXpertTeamDraft, TXpertTemplate } from '@xpert-ai/contracts'
import type { SuiteReceipt } from '../application-update.schema'
export interface SuiteDefinition {
    key: string
    templateKey: string
    primaryAgentKey: string
    name: string
    title: string
    externalRoleKeys?: string[]
}
export interface SuiteProfile {
    schemaVersion: 'xpert-assistant-suite@1'
    key: string
    plugin: { name: string; version?: string }
    roles: SuiteDefinition[]
    orchestrator: SuiteDefinition
}
export interface SuiteInstallation {
    scope: { tenantId: string | null; organizationId: string; workspaceId: string }
    plugin: { name: string }
    roles: Array<{ key: string; templateKey: string; id: string }>
    orchestrator: { key: string; templateKey: string; id: string }
}
export interface SuitePorts {
    plugins(name: string): Promise<Array<{ name: string; currentVersion: string; loadStatus?: string }>>
    template(id: string): Promise<TXpertTemplate>
    load(id: string): Promise<IXpert>
    find(name: string): Promise<IXpert | null>
    install(
        id: string,
        input: { workspaceId: string; publish: boolean; basic: { name: string; title: string } }
    ): Promise<{ xpert: { id: string } }>
    sync(id: string): Promise<unknown>
    draft(id: string, draft: TXpertTeamDraft): Promise<unknown>
    publish(id: string, input: { environmentId: string | null; releaseNotes: string }): Promise<unknown>
    resume(id: string, version: string): Promise<unknown>
}
export function executeSuite(context: {
    args: { refresh?: boolean; resume?: boolean; runId?: string; environmentId?: string; releaseNotes?: string }
    profile: SuiteProfile
    workspaceId: string
    runId: string
    apiRoot: string
    scope: SuiteInstallation['scope']
    installation?: SuiteInstallation | null
    receipt?: SuiteReceipt | null
    save(receipt: SuiteReceipt): Promise<void>
    progress?(key: string): void
    ports: SuitePorts
}): Promise<SuiteReceipt>
