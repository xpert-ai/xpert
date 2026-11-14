import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import type { IUser } from '@xpert-ai/contracts'
import type {
    CollaborationDocumentRecord,
    CollaborationProviderContext,
    CollaborationScope,
    CollaborationRuntimeActor,
    ICollaborationActor,
    ICollaborationPresence
} from '@xpert-ai/plugin-sdk'
import { environment } from '@xpert-ai/server-config'
import type { CollaborationDocument } from './entities'
import type { CollaborationRuntimeDefaults, CollaborationSession } from './collaboration.service'
import { optionalText } from './collaboration-input'
const COLLABORATION_NAMESPACE = '/api/collaboration'

export function toRecord(document: CollaborationDocument): CollaborationDocumentRecord {
    return {
        id: document.id,
        providerKey: document.providerKey,
        resourceId: document.resourceId,
        engine: document.engine,
        schemaVersion: document.schemaVersion,
        status: document.status,
        sequenceNumber: document.sequenceNumber,
        updateCount: document.updateCount,
        materializedSequence: document.materializedSequence,
        materializationStatus: document.materializationStatus,
        lastMaterializationError: document.lastMaterializationError ?? null,
        tenantId: document.tenantId ?? null,
        organizationId: document.organizationId ?? null,
        workspaceId: document.workspaceId ?? null,
        projectId: document.projectId ?? null,
        xpertId: document.xpertId ?? null,
        userId: document.userId ?? null,
        metadata: document.metadata ?? null,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt
    }
}

/** Stable storage boundary that deliberately excludes public business identifiers. */
export function collaborationScopeKey(scope: CollaborationScope) {
    return createHash('sha256')
        .update([scope.tenantId ?? '-', scope.organizationId ?? '-'].join(':'))
        .digest('hex')
}

export function scopeColumns(scope: CollaborationScope) {
    return {
        tenantId: scope.tenantId ?? null,
        organizationId: scope.organizationId ?? null,
        workspaceId: scope.workspaceId ?? null,
        projectId: scope.projectId ?? null,
        xpertId: scope.xpertId ?? null,
        userId: scope.userId ?? null
    }
}

export function documentScope(document: CollaborationDocument): CollaborationScope {
    return scopeColumns(document)
}

export function scopedDocumentIdWhere(id: string, scope: CollaborationScope) {
    return { id, scopeKey: collaborationScopeKey(scope) }
}

export function providerContext(
    providerKey: string,
    resourceId: string,
    scope: CollaborationScope,
    operation: CollaborationProviderContext['operation'],
    documentId?: string,
    actor?: ICollaborationActor
): CollaborationProviderContext {
    return { ...scope, providerKey, resourceId, operation, documentId: documentId ?? null, actor: actor ?? null }
}

export function createUserActor(
    user: IUser | null,
    userId: string | null | undefined,
    sessionId: string
): ICollaborationActor {
    const displayName = userDisplayName(user) ?? 'Collaborator'
    const identity = userId ?? sessionId
    return {
        presenceId: `user_${createHash('sha256').update(identity).digest('base64url').slice(0, 22)}`,
        actorType: 'user',
        displayName: displayName.slice(0, 64),
        color: actorColor(identity),
        avatarUrl: optionalText(user?.imageUrl, 2_048) ?? null
    }
}

export function createRuntimeActor(
    scope: CollaborationScope,
    input?: CollaborationRuntimeActor | null
): ICollaborationActor {
    const actorType = input?.actorType === 'system' ? 'system' : input?.actorType === 'user' ? 'user' : 'agent'
    const key = input?.actorKey ?? scope.xpertId ?? scope.userId ?? randomUUID()
    return {
        presenceId: `${actorType}_${createHash('sha256').update(key).digest('base64url').slice(0, 22)}`,
        actorType,
        displayName:
            optionalText(input?.displayName, 64) ??
            (actorType === 'agent' ? 'Xpert Agent' : actorType === 'system' ? 'System' : 'Collaborator'),
        color: actorColor(key),
        avatarUrl: optionalText(input?.avatarUrl, 2_048) ?? null
    }
}

/** Build a stable Agent identity per xpert/agent/conversation/document combination. */
export function createVirtualActor(
    documentId: string,
    scope: CollaborationScope,
    defaults: CollaborationRuntimeDefaults,
    input?: CollaborationRuntimeActor | null
) {
    const actorType = input?.actorType === 'system' ? 'system' : 'agent'
    const actorKey =
        input?.actorKey ??
        [
            defaults.xpertId ?? scope.xpertId ?? '-',
            defaults.agentKey ?? '-',
            defaults.conversationId ?? '-',
            documentId
        ].join(':')
    return createRuntimeActor(scope, {
        actorType,
        actorKey,
        displayName:
            input?.displayName ??
            defaults.xpertName ??
            defaults.agentKey ??
            (actorType === 'agent' ? 'Xpert Agent' : 'System'),
        avatarUrl: input?.avatarUrl
    })
}

export function actorToRuntime(actor: ICollaborationActor): CollaborationRuntimeActor {
    return {
        actorType: actor.actorType,
        actorKey: actor.presenceId,
        displayName: actor.displayName,
        avatarUrl: actor.avatarUrl
    }
}

export function userDisplayName(user: IUser | null) {
    if (!user) return null
    const candidate = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
    return optionalText(candidate || user.name || user.email, 64) ?? null
}

export function actorColor(identity: string) {
    const hue = (createHash('sha256').update(identity).digest()[0] / 255) * 330
    return hslToHex(hue, 72, 46)
}

export function hslToHex(h: number, s: number, l: number) {
    const saturation = s / 100
    const lightness = l / 100
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = lightness - chroma / 2
    const [r, g, b] =
        h < 60
            ? [chroma, x, 0]
            : h < 120
              ? [x, chroma, 0]
              : h < 180
                ? [0, chroma, x]
                : h < 240
                  ? [0, x, chroma]
                  : h < 300
                    ? [x, 0, chroma]
                    : [chroma, 0, x]
    return `#${[r, g, b]
        .map((value) =>
            Math.round((value + m) * 255)
                .toString(16)
                .padStart(2, '0')
        )
        .join('')}`
}

export function parsePresence(raw: string): ICollaborationPresence | null {
    try {
        const value = JSON.parse(raw) as ICollaborationPresence
        return value && typeof value.updatedAt === 'number' ? value : null
    } catch {
        return null
    }
}

export function sessionKey(sessionId: string) {
    return `xpert:collaboration:session:${hashSecret(sessionId)}`
}
export function presenceKey(scope: CollaborationScope, documentId: string) {
    return `xpert:collaboration:presence:${collaborationScopeKey(scope)}:${documentId}`
}
export function presenceIndexKey(scope: CollaborationScope, documentId: string) {
    return `${presenceKey(scope, documentId)}:index`
}
export function presenceEntryKey(scope: CollaborationScope, documentId: string, clientId: string) {
    return `${presenceKey(scope, documentId)}:entry:${createHash('sha256').update(clientId).digest('base64url')}`
}
export function hashSecret(value: string) {
    return createHash('sha256').update(value).digest('hex')
}
export function timingSafeHashEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function parseSession(raw: string): CollaborationSession | null {
    try {
        const value = JSON.parse(raw) as CollaborationSession
        return value?.sessionId && value?.documentId && value?.clientKeyHash ? value : null
    } catch {
        return null
    }
}

export function collaborationConnectionUrl() {
    const base = optionalText(environment.baseUrl, 2_048) ?? 'http://localhost:3000'
    return new URL(COLLABORATION_NAMESPACE, base.endsWith('/') ? base : `${base}/`).toString().replace(/\/$/, '')
}

export function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}
