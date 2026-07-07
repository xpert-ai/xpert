import {
    TXpertAccessRequestCreateInput,
    TXpertAccessRequestDecisionInput,
    TXpertMarketplaceAccessStatus,
    TXpertMarketplaceQuery,
    XpertMarketplaceBusinessCategories,
    XpertMarketplaceCollaborationModes,
    XpertMarketplaceTechnicalCategories
} from '@xpert-ai/contracts'
import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import { t } from 'i18next'
import { XpertMarketplaceService } from './xpert-marketplace.service'

type XpertMarketplaceQueryParams = {
    search?: string
    businessCategories?: string | string[]
    capabilityTags?: string | string[]
    collaborationModes?: string | string[]
    technicalCategories?: string | string[]
    status?: string
    sort?: string
    skip?: string
    take?: string
}

const accessStatuses: TXpertMarketplaceAccessStatus[] = [
    'not_requested',
    'requested',
    'approved',
    'rejected',
    'accessible',
    'owned'
]

@Controller()
export class XpertMarketplaceController {
    constructor(private readonly service: XpertMarketplaceService) {}

    @Get('xpert-marketplace')
    async findMarketplace(@Query() query: XpertMarketplaceQueryParams) {
        return this.service.findMarketplace(this.parseQuery(query))
    }

    @Get('xpert-marketplace/:id')
    async getMarketplaceItem(@Param('id') id: string) {
        return this.service.getMarketplaceItem(id)
    }

    @Post('xpert-marketplace/:id/access-requests')
    async requestAccess(@Param('id') id: string, @Body() body: TXpertAccessRequestCreateInput) {
        return this.service.requestAccess(id, body)
    }

    @Get('xpert-access-requests/my')
    async findMyRequests() {
        return this.service.findMyRequests()
    }

    @Get('xpert-access-requests/reviewable')
    async findReviewableRequests() {
        return this.service.findReviewableRequests()
    }

    @Put('xpert-access-requests/:id/approve')
    async approveRequest(@Param('id') id: string, @Body() body: TXpertAccessRequestDecisionInput) {
        return this.service.approveRequest(id, body)
    }

    @Put('xpert-access-requests/:id/reject')
    async rejectRequest(@Param('id') id: string, @Body() body: TXpertAccessRequestDecisionInput) {
        return this.service.rejectRequest(id, body)
    }

    private parseQuery(query: XpertMarketplaceQueryParams): TXpertMarketplaceQuery {
        return {
            search: query.search,
            businessCategories: this.readEnumList(
                query.businessCategories,
                XpertMarketplaceBusinessCategories,
                'businessCategories'
            ),
            capabilityTags: this.readStringList(query.capabilityTags),
            collaborationModes: this.readEnumList(
                query.collaborationModes,
                XpertMarketplaceCollaborationModes,
                'collaborationModes'
            ),
            technicalCategories: this.readEnumList(
                query.technicalCategories,
                XpertMarketplaceTechnicalCategories,
                'technicalCategories'
            ),
            status: this.readStatus(query.status),
            sort: this.readSort(query.sort),
            skip: this.readNumber(query.skip),
            take: this.readNumber(query.take)
        }
    }

    private readStringList(value?: string | string[]) {
        if (value == null) {
            return []
        }
        const rawItems = Array.isArray(value) ? value : value.split(',')
        return rawItems.map((item) => item.trim()).filter(Boolean)
    }

    private readEnumList<T extends string>(
        value: string | string[] | undefined,
        options: readonly T[],
        field: string
    ): T[] {
        const items = this.readStringList(value)
        if (items.some((item) => !options.includes(item as T))) {
            throw new BadRequestException(
                t('server-ai:Error.XpertMarketplaceInvalidField', {
                    field,
                    defaultValue: 'Invalid marketplace field.'
                })
            )
        }
        return Array.from(new Set(items as T[]))
    }

    private readStatus(value?: string): TXpertMarketplaceAccessStatus | null {
        if (!value) {
            return null
        }
        if (!accessStatuses.includes(value as TXpertMarketplaceAccessStatus)) {
            throw new BadRequestException(
                t('server-ai:Error.XpertMarketplaceInvalidField', {
                    field: 'status',
                    defaultValue: 'Invalid marketplace field.'
                })
            )
        }
        return value as TXpertMarketplaceAccessStatus
    }

    private readSort(value?: string): TXpertMarketplaceQuery['sort'] {
        if (value === 'hot' || value === 'updated' || value === 'match') {
            return value
        }
        return undefined
    }

    private readNumber(value?: string) {
        if (!value) {
            return undefined
        }
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : undefined
    }
}
