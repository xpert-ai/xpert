import {
    AssistantCode,
    IOrganization,
    IResolvedAssistantBinding,
    IUser,
    IUserOrganization,
    SANDBOX_TERMINAL_NAMESPACE,
    XpertMobileAssistantBindingSummary,
    XpertMobileBootstrap,
    XpertMobileDeploymentConfig,
    XpertMobileOrganizationSummary,
    XpertMobileUserSummary,
    XpertMobileXpertSummary,
    XpertMobileXpertsResponse,
    XpertTypeEnum
} from '@xpert-ai/contracts'
import { UnauthorizedException, Injectable } from '@nestjs/common'
import { UserService } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { AssistantBindingService } from '../assistant-binding/assistant-binding.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { Xpert } from '../xpert/xpert.entity'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

type ListXpertsQuery = {
    search?: string
    limit?: string
    offset?: string
}

@Injectable()
export class MobileService {
    constructor(
        private readonly userService: UserService,
        private readonly assistantBindingService: AssistantBindingService,
        private readonly publishedXpertAccessService: PublishedXpertAccessService
    ) {}

    async getBootstrap(): Promise<XpertMobileBootstrap> {
        const userId = RequestContext.currentUserId()
        if (!userId) {
            throw new UnauthorizedException()
        }

        const activeOrganizationId = RequestContext.getOrganizationId()
        const user = await this.userService.findCurrentUser(userId, ['organizations', 'organizations.organization'], {
            currentOrganizationId: activeOrganizationId
        })
        const organizations = summarizeOrganizations(user.organizations ?? [])
        const defaultOrganizationId =
            organizations.find((organization) => organization.id === activeOrganizationId)?.id ??
            organizations.find((organization) => organization.isDefault)?.id ??
            organizations[0]?.id ??
            null

        return {
            deployment: getDeploymentConfig(),
            user: summarizeUser(user),
            organizations,
            activeOrganizationId: activeOrganizationId ?? defaultOrganizationId,
            defaultOrganizationId,
            assistantBindings: await this.getAssistantBindings()
        }
    }

    async listXperts(query: ListXpertsQuery): Promise<XpertMobileXpertsResponse> {
        const limit = normalizeLimit(query.limit)
        const offset = normalizeOffset(query.offset)
        const search = normalizeSearch(query.search)
        const where = {
            type: XpertTypeEnum.Agent,
            latest: true
        }
        const [items, total] = await Promise.all([
            this.publishedXpertAccessService.findAccessiblePublishedXperts({
                where,
                search,
                take: limit,
                skip: offset,
                order: {
                    updatedAt: 'DESC',
                    createdAt: 'DESC'
                }
            }),
            this.publishedXpertAccessService.countAccessiblePublishedXperts(where, search)
        ])

        return {
            items: items.map(summarizeXpert),
            total,
            limit,
            offset
        }
    }

    private async getAssistantBindings(): Promise<XpertMobileAssistantBindingSummary[]> {
        const bindings = await Promise.all(
            [AssistantCode.CHAT_COMMON, AssistantCode.XPERT_SHARED, AssistantCode.CHATBI].map((code) =>
                this.resolveAssistantBinding(code)
            )
        )

        return bindings.filter((binding): binding is XpertMobileAssistantBindingSummary => !!binding)
    }

    private async resolveAssistantBinding(code: AssistantCode): Promise<XpertMobileAssistantBindingSummary | null> {
        try {
            const binding = await this.assistantBindingService.getEffectiveBinding(code)
            return summarizeAssistantBinding(binding)
        } catch {
            return null
        }
    }
}

export function getDeploymentConfig(): XpertMobileDeploymentConfig {
    return {
        apiBaseUrl: normalizeOptionalString(
            process.env.MOBILE_API_BASE_URL ?? process.env.PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL
        ),
        apiBasePath: '/api',
        aiApiPath: '/api/ai',
        chatkitFrameUrl:
            normalizeOptionalString(process.env.MOBILE_CHATKIT_FRAME_URL ?? process.env.CHATKIT_FRAME_URL) ??
            '/chatkit',
        viewHostsPath: '/api/view-hosts',
        socketNamespaces: {
            sandboxTerminal: SANDBOX_TERMINAL_NAMESPACE
        },
        capabilities: {
            chatkit: true,
            extensionViews: true,
            scheduledTasks: true,
            fileMemory: true,
            sandboxTerminal: true,
            publicChatkitSessions: true
        }
    }
}

export function summarizeUser(user: IUser): XpertMobileUserSummary {
    return {
        id: user.id,
        tenantId: user.tenantId ?? null,
        email: user.email ?? null,
        name: user.name ?? null,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        fullName: user.fullName ?? null,
        imageUrl: user.imageUrl ?? null,
        preferredLanguage: user.preferredLanguage ?? null
    }
}

export function summarizeOrganizations(memberships: IUserOrganization[]): XpertMobileOrganizationSummary[] {
    return memberships
        .filter((membership) => membership.isActive !== false && !!membership.organization?.id)
        .map((membership) => summarizeOrganization(membership, membership.organization))
}

export function summarizeOrganization(
    membership: IUserOrganization,
    organization: IOrganization
): XpertMobileOrganizationSummary {
    return {
        id: organization.id,
        tenantId: organization.tenantId ?? membership.tenantId ?? null,
        name: organization.name,
        imageUrl: organization.imageUrl ?? null,
        isDefault: membership.isDefault === true || organization.isDefault === true,
        isActive: membership.isActive !== false && organization.isActive !== false,
        timeZone: organization.timeZone ?? null,
        preferredLanguage: organization.preferredLanguage ?? null
    }
}

export function summarizeAssistantBinding(binding: IResolvedAssistantBinding): XpertMobileAssistantBindingSummary {
    return {
        code: binding.code,
        scope: binding.scope,
        sourceScope: binding.sourceScope,
        assistantId: binding.assistantId,
        enabled: binding.enabled,
        tenantId: binding.tenantId,
        organizationId: binding.organizationId,
        userId: binding.userId
    }
}

export function summarizeXpert(xpert: Xpert): XpertMobileXpertSummary {
    return {
        id: xpert.id,
        slug: xpert.slug,
        name: `${xpert.name}`,
        type: xpert.type,
        title: xpert.title ?? null,
        titleCN: xpert.titleCN ?? null,
        description: xpert.description ?? null,
        avatar: xpert.avatar ?? null,
        version: xpert.version ?? null,
        latest: xpert.latest ?? null,
        workspaceId: xpert.workspaceId ?? null,
        organizationId: xpert.organizationId ?? null,
        publishAt: xpert.publishAt ?? null,
        starters: xpert.starters ?? null
    }
}

function normalizeLimit(value?: string): number {
    const parsed = Number.parseInt(value ?? '', 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_LIMIT
    }

    return Math.min(parsed, MAX_LIMIT)
}

function normalizeOffset(value?: string): number {
    const parsed = Number.parseInt(value ?? '', 10)
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0
    }

    return parsed
}

function normalizeSearch(value?: string): string | undefined {
    const search = normalizeOptionalString(value)
    return search ? search.slice(0, 120) : undefined
}

function normalizeOptionalString(value?: string | null): string | null {
    const normalized = value?.trim()
    return normalized ? normalized : null
}
