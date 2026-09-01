import { getMetadataArgsStorage } from 'typeorm'
import { ConnectorOAuthSession } from './connector-oauth-session.entity'
import { ConnectorPersonalAccount } from './connector-personal-account.entity'
import { ConnectorPersonalGrant } from './connector-personal-grant.entity'
import { ConnectorRuntimeAudit } from './connector-runtime-audit.entity'
import { Connector } from './connector.entity'

describe('Connector persistence entities', () => {
    it('registers the Binding, personal authorization, OAuth session, and runtime audit tables', () => {
        const targets = [
            Connector,
            ConnectorOAuthSession,
            ConnectorPersonalAccount,
            ConnectorPersonalGrant,
            ConnectorRuntimeAudit
        ]
        const tables = getMetadataArgsStorage()
            .tables.filter((table) => targets.some((target) => table.target === target))
            .map((table) => table.name)

        expect(tables).toEqual(
            expect.arrayContaining([
                'xpert_connector',
                'xpert_connector_oauth_session',
                'xpert_connector_personal_account',
                'xpert_connector_personal_grant',
                'xpert_connector_runtime_audit'
            ])
        )
    })

    it('requires exactly one Binding scope and one provider per scope', () => {
        const metadata = getMetadataArgsStorage()
        const scopeCheck = metadata.checks.find(
            (check) => check.target === Connector && check.name === 'CHK_xpert_connector_scope'
        )
        const sessionScopeCheck = metadata.checks.find(
            (check) =>
                check.target === ConnectorOAuthSession && check.name === 'CHK_xpert_connector_oauth_session_scope'
        )
        const bindingModeCheck = metadata.checks.find(
            (check) => check.target === Connector && check.name === 'CHK_xpert_connector_authorization_mode'
        )
        const sessionModeCheck = metadata.checks.find(
            (check) =>
                check.target === ConnectorOAuthSession &&
                check.name === 'CHK_xpert_connector_oauth_session_authorization_mode'
        )
        const workspaceProvider = metadata.indices.find(
            (index) => index.target === Connector && index.name === 'UQ_xpert_connector_workspace_provider'
        )
        const projectProvider = metadata.indices.find(
            (index) => index.target === Connector && index.name === 'UQ_xpert_connector_project_provider'
        )

        expect(scopeCheck?.expression).toBe(
            `("scopeType" = 'workspace' AND "workspaceId" IS NOT NULL AND "projectId" IS NULL) OR ("scopeType" = 'project' AND "projectId" IS NOT NULL AND "workspaceId" IS NULL)`
        )
        expect(sessionScopeCheck?.expression).toBe(scopeCheck?.expression)
        expect(bindingModeCheck?.expression).toBe(`"authorizationMode" IN ('personal', 'shared')`)
        expect(sessionModeCheck?.expression).toBe(bindingModeCheck?.expression)
        expect(workspaceProvider).toMatchObject({
            columns: ['tenantId', 'workspaceId', 'provider'],
            unique: true,
            where: '"scopeType" = \'workspace\' AND "workspaceId" IS NOT NULL'
        })
        expect(projectProvider).toMatchObject({
            columns: ['tenantId', 'projectId', 'provider'],
            unique: true,
            where: '"scopeType" = \'project\' AND "projectId" IS NOT NULL'
        })
    })

    it('keeps Binding ownership and OAuth authority fields immutable after creation', () => {
        const columns = getMetadataArgsStorage().columns
        const column = (target: object, propertyName: string) =>
            columns.find((item) => item.target === target && item.propertyName === propertyName)?.options

        for (const propertyName of ['scopeType', 'workspaceId', 'projectId', 'provider', 'authorizationMode']) {
            expect(column(Connector, propertyName)).toMatchObject({ update: false })
        }
        for (const propertyName of [
            'stateHash',
            'scopeType',
            'workspaceId',
            'projectId',
            'authorizationMode',
            'connectorId',
            'personalAccountId',
            'actorUserId',
            'xpertId',
            'connectionAttemptId',
            'provider',
            'redirectUri'
        ]) {
            expect(column(ConnectorOAuthSession, propertyName)).toMatchObject({ update: false })
        }
    })

    it('cascades Project-scoped Bindings when a Project is deleted directly', () => {
        const projectRelation = getMetadataArgsStorage().relations.find(
            (relation) => relation.target === Connector && relation.propertyName === 'project'
        )

        expect(projectRelation).toMatchObject({
            relationType: 'many-to-one',
            type: 'XpertProject',
            options: expect.objectContaining({ nullable: true, onDelete: 'CASCADE' })
        })
    })
})
