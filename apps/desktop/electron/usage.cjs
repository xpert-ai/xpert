// Read-only membership endpoints. Identity and organization always come from the host session.
function createUsageMethods(ClientError) {
  const invalid = () => new ClientError('Invalid usage response. Please retry.', 502)
  const text = (value) => (typeof value === 'string' ? value : null)
  const number = (value) => {
    if ((typeof value !== 'number' && typeof value !== 'string') || value === '') throw invalid()
    const result = Number(value)
    if (!Number.isFinite(result)) throw invalid()
    return result
  }
  const allowance = (value) => (value === null ? null : number(value))
  const date = (value) => {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw invalid()
    return value
  }
  const list = (value) => {
    if (!Array.isArray(value)) throw invalid()
    return value
  }
  const groupFields = [
    'usageHour',
    'usageChannel',
    'provider',
    'model',
    'organizationId',
    'xpertId',
    'threadId',
    'copilotId'
  ]
  const group = (value) => Object.fromEntries(groupFields.map((key) => [key, text(value?.[key])]))
  function context(service) {
    if (!service.credentials || !service.profile) throw new ClientError('Please sign in first.', 401)
    const id = service.profile.organizationId
    if (!id || !service.profile.organizations.some((org) => org.id === id))
      throw new ClientError('Select an organization to view usage.', 409)
    return id
  }
  function query(service, input, pagination = false) {
    const organizationId = context(service)
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ClientError('Invalid usage filters.')
    const allowed = [
      'start',
      'end',
      'model',
      'threadId',
      'xpertId',
      'provider',
      'copilotId',
      'usageHour',
      'usageChannel',
      ...(pagination ? ['skip', 'take', 'group'] : [])
    ]
    if (Object.keys(input).some((key) => !allowed.includes(key))) throw new ClientError('Invalid usage filters.')
    if (typeof input.start !== 'string' || typeof input.end !== 'string')
      throw new ClientError('Invalid usage filters.')
    const start = Date.parse(input.start)
    const end = Date.parse(input.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 32 * 86400000)
      throw new ClientError('Invalid usage filters.')
    const params = new URLSearchParams({
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      organizationId
    })
    for (const key of allowed.filter((key) => !['start', 'end', 'skip', 'take', 'group'].includes(key))) {
      if (input[key] === undefined || input[key] === null || input[key] === '') continue
      if (typeof input[key] !== 'string' || input[key].length > 1000) throw new ClientError('Invalid usage filters.')
      params.set(key, input[key])
    }
    if (pagination) {
      const take = input.take ?? 20
      const skip = input.skip ?? 0
      if (!Number.isInteger(take) || take < 1 || take > 100 || !Number.isInteger(skip) || skip < 0)
        throw new ClientError('Invalid usage filters.')
      params.set('$take', String(take))
      params.set('$skip', String(skip))
    }
    return params
  }
  async function read(service, path) {
    context(service)
    return service.request(`/api/membership/${path}`, { scope: 'organization' })
  }
  return {
    async usageMembership() {
      const value = await read(this, 'me')
      if (value === null) return null
      if (!value?.plan || !value.membership || !text(value.plan.name)) throw invalid()
      return {
        planName: value.plan.name,
        description: text(value.plan.description),
        status: text(value.membership.status),
        personalPointsOnly: value.personalPointsOnly === true,
        pointsGranted: allowance(value.pointsGranted),
        pointsUsed: number(value.pointsUsed),
        pointsRemaining: allowance(value.pointsRemaining),
        personalPointsBalance: number(value.personalPointsBalance),
        currentPeriodStart: date(value.currentPeriodStart),
        currentPeriodEnd: date(value.currentPeriodEnd),
        allowedModels: list(value.plan.allowedModels ?? []).map((model) => {
          if (!text(model.model) || !text(model.provider)) throw invalid()
          return `${model.provider} / ${model.model}`
        })
      }
    },
    async usagePeriods() {
      const value = await read(this, 'me/periods')
      return list(value)
        .map((period) => {
          if (!text(period?.id) || !text(period.planSnapshot?.name ?? period.plan?.name)) throw invalid()
          return {
            id: period.id,
            planName: period.planSnapshot?.name ?? period.plan.name,
            status: text(period.status),
            periodStart: date(period.periodStart),
            periodEnd: date(period.periodEnd),
            pointsGranted: allowance(period.pointsGranted),
            pointsUsed: number(period.pointsUsed)
          }
        })
        .sort((a, b) => Date.parse(b.periodStart) - Date.parse(a.periodStart))
    },
    async usageOverview(input) {
      const value = await read(this, `me/overview?${query(this, input)}`)
      const ranks = (rows) =>
        list(rows).map((row) => {
          if (!text(row?.key)) throw invalid()
          return {
            key: row.key,
            label: text(row.label) || row.key,
            pointsUsed: number(row.pointsUsed),
            tokenUsed: number(row.tokenUsed)
          }
        })
      return {
        totalTokens: number(value?.totalTokens),
        buckets: list(value?.buckets).map((row) => ({
          date: date(row.date),
          pointsUsed: number(row.pointsUsed),
          tokenUsed: number(row.tokenUsed)
        })),
        topModels: ranks(value.topModels),
        topXperts: ranks(value.topXperts),
        topThreads: ranks(value.topThreads)
      }
    },
    async usageSummaries(input) {
      const value = await read(this, `me/usage-summary?${query(this, input, true)}`)
      return {
        total: number(value?.total),
        items: list(value?.items).map((row) => ({
          group: group(row.groupKey),
          conversationTitle: text(row.conversationTitle),
          assistantTitle: text(row.xpertTitle) || text(row.xpertName),
          pointsUsed: number(row.pointsUsed),
          tokenUsed: number(row.tokenUsed),
          firstUsedAt: row.firstUsedAt ? date(row.firstUsedAt) : null,
          lastUsedAt: row.lastUsedAt ? date(row.lastUsedAt) : null
        }))
      }
    },
    async usageEntries(input) {
      const params = query(this, input, true)
      if (
        !input.group ||
        typeof input.group !== 'object' ||
        Array.isArray(input.group) ||
        groupFields.some((key) => input.group[key] !== null && typeof input.group[key] !== 'string') ||
        input.group.organizationId !== context(this)
      )
        throw new ClientError('Invalid usage filters.')
      // The API cannot express null group dimensions. Filter each page exactly instead of mixing groups.
      for (const key of groupFields) {
        if (input.group[key]) params.set(key, input.group[key])
        else params.delete(key)
      }
      const value = await read(this, `me/usage?${params}`)
      const rows = list(value?.items)
      const total = number(value?.total)
      const nextSkip = Number(params.get('$skip')) + rows.length
      return {
        nextSkip: rows.length && nextSkip < total ? nextSkip : null,
        items: rows
          .filter((row) => groupFields.every((key) => text(row[key]) === input.group[key]))
          .map((row) => ({
            id: text(row.id),
            createdAt: date(row.createdAt),
            points: Math.abs(number(row.pointsDelta)),
            tokenUsed: row.tokenUsed == null ? null : number(row.tokenUsed),
            source: text(row.source)
          }))
      }
    }
  }
}
module.exports = { createUsageMethods }
