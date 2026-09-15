// Invariants: authenticate before buffering uploads; bind storage to the verified user, never request fields.
import type { IUser, McpPrincipal } from '@xpert-ai/contracts'
import type { WorkspaceFilesApi } from '@xpert-ai/plugin-sdk'
import { BadRequestException, ForbiddenException, Injectable, PayloadTooLargeException } from '@nestjs/common'
import { t } from 'i18next'
import { randomUUID } from 'node:crypto'
import type { Request } from 'express'
import { runWithCapturedRequestContext } from '../shared/request-context'
import { WorkspaceFilesRuntimeCapabilityService } from '../shared/runtime/workspace-files-runtime-capability.service'
import { resolveToolRuntimeScope } from '../tool-runtime/workspace-scope'
import { McpPublication } from './entities'
import { McpAuthenticationService } from './mcp-authentication.service'
import { McpPublicationAuthorizationService } from './mcp-publication-authorization.service'
import { McpPublicationService } from './mcp-publication.service'
import { McpRateLimitService } from './mcp-rate-limit.service'
import { parseMcpRuntimeConfiguration } from './mcp-runtime-configuration'

export const MCP_FILE_MAX_BYTES = 256 * 1024 * 1024

type AuthorizedFileContext = { publication: McpPublication; principal: McpPrincipal; user: IUser }

@Injectable()
export class McpFilesService {
    private readonly requests = new WeakMap<Request, AuthorizedFileContext>()

    constructor(
        private readonly publications: McpPublicationService,
        private readonly authentication: McpAuthenticationService,
        private readonly authorization: McpPublicationAuthorizationService,
        private readonly rateLimit: McpRateLimitService,
        private readonly workspaceFiles: WorkspaceFilesRuntimeCapabilityService
    ) {}

    async authorize(request: Request) {
        const publication = await this.publications.findActiveBySlug(request.params.slug)
        const principal = await this.authentication.authenticate(publication, request.headers.authorization)
        const user = await this.authorization.assertCanRun(publication, principal)
        const action = request.method === 'POST' ? 'files:write' : 'files:read'
        if (
            !user ||
            principal.subjectType !== 'user' ||
            !principal.scopes.some((scope) => scope === '*' || scope === action)
        ) {
            throw fileAccessDenied()
        }
        const runtime = parseMcpRuntimeConfiguration(publication.runtime)
        if (runtime?.files?.type !== 'user') throw fileAccessDenied()
        await this.rateLimit.assertWithinLimit(publication, principal)
        this.requests.set(request, { publication, principal, user })
    }

    upload(request: Request, file: Express.Multer.File | undefined) {
        if (!file?.buffer?.length) {
            throw new BadRequestException(
                t('server-ai:Error.McpFileRequired', { defaultValue: 'A non-empty file is required.' })
            )
        }
        assertFileSize(file.buffer.length)
        const name = file.originalname
            .split(/[\\/]/)
            .pop()
            ?.replace(/[\u0000-\u001f\u007f]/g, '')
            .trim()
        if (!name || name === '.' || name === '..') {
            throw new BadRequestException(
                t('server-ai:Error.McpFileNameInvalid', { defaultValue: 'The file name is invalid.' })
            )
        }
        return this.withFiles(request, async (files, publication) => {
            const written = await files.writeRuntimeBuffer({
                buffer: file.buffer,
                originalName: name,
                fileName: name,
                folder: `files/mcp/${publication.id}/imports/${randomUUID()}`,
                mimeType: file.mimetype || 'application/octet-stream'
            })
            return {
                name,
                size: written.size,
                mimeType: written.mimeType,
                reference: written.reference,
                downloadPath: `/api/mcp/p/${encodeURIComponent(publication.slug)}/files?filePath=${encodeURIComponent(written.reference.filePath)}`
            }
        })
    }

    download(request: Request, filePath: unknown) {
        if (
            typeof filePath !== 'string' ||
            !filePath ||
            filePath.length > 4096 ||
            filePath.startsWith('/') ||
            filePath.includes('\\')
        ) {
            throw new BadRequestException(
                t('server-ai:Error.McpFilePathInvalid', { defaultValue: 'A relative workspace file path is required.' })
            )
        }
        return this.withFiles(request, async (files) => {
            const reference = await files.resolveRuntimeReference({ filePath })
            const metadata = await files.resolveFile(reference)
            assertFileSize(metadata.size)
            const result = await files.readRuntimeBuffer(reference)
            assertFileSize(result.buffer.length)
            return result
        })
    }

    private withFiles<T>(
        request: Request,
        operation: (files: WorkspaceFilesApi, publication: McpPublication) => Promise<T>
    ) {
        const context = this.requests.get(request)
        if (!context) throw fileAccessDenied()
        const { principal, publication, user } = context
        const scope = resolveToolRuntimeScope(
            {
                tenantId: publication.tenantId,
                organizationId: principal.organizationId,
                userId: user.id
            },
            undefined,
            { type: 'user' }
        )
        return runWithCapturedRequestContext(
            {
                user,
                headers: {
                    'tenant-id': publication.tenantId,
                    ...(principal.organizationId ? { 'organization-id': principal.organizationId } : {})
                }
            },
            () => operation(this.workspaceFiles.createScopedApi(scope), publication)
        )
    }
}

function fileAccessDenied() {
    return new ForbiddenException(
        t('server-ai:Error.McpFileAccessDenied', {
            defaultValue: 'Personal files must be enabled and the authenticated user must have the required file scope.'
        })
    )
}

function assertFileSize(size: number | null | undefined) {
    if (size !== undefined && size !== null && (!Number.isFinite(size) || size < 0 || size > MCP_FILE_MAX_BYTES)) {
        throw new PayloadTooLargeException(
            t('server-ai:Error.McpFileTooLarge', {
                defaultValue: 'MCP binary file transfer is limited to 256 MiB per file.'
            })
        )
    }
}
