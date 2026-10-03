const organizationId = 'fixture-organization'
function usageFixture(path, scenario = 'populated') {
  const url = new URL(path, 'http://localhost')
  const today = new Date()
  const date = (days, hour = 10) => {
    const value = new Date(today)
    value.setDate(value.getDate() - days)
    value.setHours(hour, 0, 0, 0)
    return value.toISOString()
  }
  const titles = ['调研 Sandbox 连接方案', '供应商报价对比', '完善产品发布方案', '整理知识库资料', '审阅采购合同']
  const groupKey = (index) => ({
    usageHour: date(Math.floor(index / 5)),
    usageChannel: 'xpert',
    provider: 'openai',
    model: index % 2 ? 'gpt-4.1-mini' : 'gpt-4.1',
    organizationId,
    xpertId: 'assistant-1',
    threadId: `thread-${index}`,
    copilotId: 'copilot-1'
  })
  const summaries = Array.from({ length: 13 }, (_, index) => ({
    ...groupKey(index),
    groupKey: groupKey(index),
    conversationTitle: titles[index % 5],
    xpertTitle: 'Bosi',
    pointsUsed: 280 - index * 10,
    tokenUsed: 42000 - index * 1000,
    firstUsedAt: date(Math.floor(index / 5)),
    lastUsedAt: date(Math.floor(index / 5))
  }))
  const paginate = (items) => ({
    items: items.slice(
      Number(url.searchParams.get('$skip') || 0),
      Number(url.searchParams.get('$skip') || 0) + Number(url.searchParams.get('$take') || 20)
    ),
    total: items.length
  })
  const filtered = summaries.filter((row) =>
    ['model', 'threadId', 'xpertId'].every(
      (key) => !url.searchParams.has(key) || row[key] === url.searchParams.get(key)
    )
  )
  if (url.pathname.endsWith('/me'))
    return scenario === 'no-plan'
      ? null
      : {
          plan: { name: '专业版', description: '用于团队日常工作与模型协作。', allowedModels: [] },
          membership: { status: 'active' },
          personalPointsOnly: false,
          pointsGranted: scenario === 'unlimited' ? null : 20000,
          pointsUsed: 4690,
          pointsRemaining: scenario === 'unlimited' ? null : 15310,
          personalPointsBalance: 6800,
          currentPeriodStart: date(2),
          currentPeriodEnd: new Date(today.getTime() + 28 * 86400000).toISOString()
        }
  if (url.pathname.endsWith('/periods'))
    return scenario === 'empty' || scenario === 'no-plan'
      ? []
      : Array.from({ length: 3 }, (_, index) => ({
          id: `period-${index}`,
          planSnapshot: { name: '专业版' },
          status: index ? 'completed' : 'active',
          periodStart: date(index * 30 + 2),
          periodEnd: date((index - 1) * 30 + 2),
          pointsGranted: 20000,
          pointsUsed: [4690, 16240, 12680][index]
        }))
  if (url.pathname.endsWith('/overview')) {
    const daily = [2100, 1650, 2480, 1920, 2260, 1820, 610]
    const rank = (key, label, pointsUsed, tokenUsed) => ({ key, label, pointsUsed, tokenUsed })
    return scenario === 'empty'
      ? { totalTokens: 0, buckets: [], topThreads: [], topXperts: [], topModels: [] }
      : {
          totalTokens: 1820000,
          buckets: daily.map((pointsUsed, index) => ({
            date: date(6 - index).slice(0, 10),
            pointsUsed,
            tokenUsed: Math.round((pointsUsed / 12840) * 1820000)
          })),
          topThreads: titles.map((label, index) =>
            rank(
              `thread-${index}`,
              label,
              [4280, 3260, 2100, 1540, 960][index],
              [620000, 460000, 300000, 220000, 140000][index]
            )
          ),
          topXperts: [rank('assistant-1', 'Bosi', 12840, 1820000)],
          topModels: [rank('gpt-4.1', 'gpt-4.1', 10200, 1320000), rank('gpt-4.1-mini', 'gpt-4.1-mini', 2640, 500000)]
        }
  }
  if (url.pathname.endsWith('/usage-summary')) return paginate(scenario === 'empty' ? [] : filtered)
  if (url.pathname.endsWith('/usage')) {
    const summary = summaries.find((row) => row.threadId === url.searchParams.get('threadId')) || summaries[0]
    return paginate(
      [0, 1].map((index) => ({
        ...summary.groupKey,
        id: `entry-${index}`,
        createdAt: new Date(Date.parse(summary.firstUsedAt) + index * 15 * 60000).toISOString(),
        pointsDelta: -summary.pointsUsed * (index ? 3 / 7 : 4 / 7),
        tokenUsed: index
          ? summary.tokenUsed - Math.round((summary.tokenUsed * 4) / 7)
          : Math.round((summary.tokenUsed * 4) / 7),
        source: 'usage'
      }))
    )
  }
  throw new Error(`Unexpected fixture route: ${url.pathname}`)
}
module.exports = { usageFixture, organizationId }
