// In-memory repositories for Artifact service tests; no external database is used.
export class MemoryRepository {
    readonly items: Array<Record<string, unknown>> = []
    private sequence = 0

    constructor(private readonly prefix: string) {}

    create(value: Record<string, unknown>) {
        return { ...value }
    }

    async save(value: Record<string, unknown>) {
        if (this.prefix === 'artifact' && !value.id) {
            const duplicate = this.items.find(
                (item) =>
                    item.tenantId === value.tenantId &&
                    item.organizationId === value.organizationId &&
                    item.userId === value.userId &&
                    item.pluginName === value.pluginName &&
                    item.resourceType === value.resourceType &&
                    item.resourceId === value.resourceId
            )
            if (duplicate) {
                throw Object.assign(new Error('duplicate key violates unique constraint'), { code: '23505' })
            }
        }
        const entity = {
            ...value,
            id:
                value.id ??
                (this.prefix === 'link'
                    ? `00000000-0000-4000-8000-${String((this.sequence += 1)).padStart(12, '0')}`
                    : `${this.prefix}-${(this.sequence += 1)}`),
            createdAt: value.createdAt ?? new Date(),
            updatedAt: new Date()
        }
        const stored = { ...entity }
        const index = this.items.findIndex((item) => item.id === entity.id)
        if (index >= 0) {
            this.items[index] = stored
        } else {
            this.items.push(stored)
        }
        return entity
    }

    async find(options: { where?: Record<string, unknown> }) {
        const where = options.where ?? {}
        return this.items.filter((candidate) => matchesWhere(candidate, where)).map((item) => ({ ...item }))
    }

    async findOne(options: {
        where?: Record<string, unknown>
        order?: Record<string, 'ASC' | 'DESC'>
        relations?: string[]
    }) {
        const where = options.where ?? {}
        let candidates = this.items.filter((candidate) => matchesWhere(candidate, where))
        if (options.order) {
            const [field, direction] = Object.entries(options.order)[0] ?? []
            if (field) {
                candidates = [...candidates].sort((left, right) => {
                    const leftValue = Number(left[field] ?? 0)
                    const rightValue = Number(right[field] ?? 0)
                    return direction === 'DESC' ? rightValue - leftValue : leftValue - rightValue
                })
            }
        }
        const item = candidates[0]
        return item ? { ...item } : null
    }

    async increment(criteria: Record<string, unknown>, field: string, amount: number) {
        const item = this.items.find((candidate) => matchesWhere(candidate, criteria))
        if (item) {
            item[field] = Number(item[field] ?? 0) + amount
        }
    }

    createQueryBuilder() {
        const parameters: Record<string, unknown> = {}
        const expressions: string[] = []
        let offset = 0
        let limit = Infinity
        const builder = {
            leftJoinAndSelect: () => builder,
            orderBy: () => builder,
            addOrderBy: () => builder,
            clone: () => builder,
            skip: (value: number) => { offset = value; return builder },
            take: (value: number) => { limit = value; return builder },
            where: (expression: string, values: Record<string, unknown>) => {
                expressions.push(expression)
                Object.assign(parameters, values)
                return builder
            },
            andWhere: (expression: string, values?: Record<string, unknown>) => {
                expressions.push(expression)
                Object.assign(parameters, values)
                return builder
            },
            getMany: async () => this.items.filter((candidate) => {
                if (['tenantId', 'organizationId', 'pluginName', 'resourceType', 'resourceId', 'status']
                    .some((key) => parameters[key] !== undefined && candidate[key] !== parameters[key])) return false
                if (expressions.includes('artifact.organizationId IS NULL') && candidate.organizationId) return false
                if (parameters.userId && candidate.userId && candidate.userId !== parameters.userId) return false
                if (expressions.includes('artifact.userId IS NULL') && candidate.userId) return false
                if (candidate.status === parameters.deletedStatus) return false
                return true
            }).slice(offset, offset + limit).map((item) => ({ ...item })),
            getOne: async () => {
                const item = this.items.find(
                    (candidate) =>
                        (candidate.id === parameters.linkId || candidate.slug === parameters.linkSlug) &&
                        candidate.tenantId === parameters.tenantId &&
                        (parameters.organizationId === undefined ||
                            candidate.organizationId === parameters.organizationId)
                )
                return item ? { ...item } : null
            }
        }
        return builder
    }
}

function matchesWhere(candidate: Record<string, unknown>, where: Record<string, unknown>) {
    return Object.entries(where).every(([key, value]) => candidate[key] === value)
}
