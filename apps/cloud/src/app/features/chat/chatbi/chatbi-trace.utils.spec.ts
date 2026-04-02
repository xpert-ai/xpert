import {
  extractChatBiTraceItemFromLogEvent,
  extractChatBiTraceItems,
  mergeChatBiTraceItems
} from './chatbi-trace.utils'

describe('chatbi trace utils', () => {
  it('extracts dashboard and computer components in original order and ignores other content', () => {
    const items = extractChatBiTraceItems({
      messages: [
        {
          id: 'message-1',
          role: 'ai',
          content: [
            {
              type: 'text',
              text: 'hello'
            },
            {
              type: 'component',
              id: 'dashboard-1',
              data: {
                id: 'dashboard-1',
                category: 'Dashboard',
                type: 'AnalyticalCard',
                title: 'Sales Trend'
              }
            },
            {
              type: 'component',
              id: 'program-1',
              data: {
                id: 'program-1',
                category: 'Computer',
                type: 'program',
                toolset: 'sandbox',
                tool: 'run',
                title: 'Run program',
                message: 'python app.py',
                status: 'running'
              }
            },
            {
              type: 'component',
              id: 'tool-1',
              data: {
                id: 'tool-1',
                category: 'Tool',
                type: 'program',
                title: 'Ignore'
              }
            }
          ]
        } as any
      ]
    } as any)

    expect(items).toHaveLength(2)
    expect(items[0].id).toBe('dashboard-1')
    expect(items[0].data.type).toBe('AnalyticalCard')
    expect(items[1].id).toBe('program-1')
    expect(items[1].data.type).toBe('program')
  })

  it('merges repeated item ids into one row while preserving first-seen order', () => {
    const items = mergeChatBiTraceItems([
      {
        type: 'component',
        id: 'program-1',
        data: {
          id: 'program-1',
          category: 'Computer',
          type: 'program',
          title: 'Run program',
          status: 'running'
        }
      } as any,
      {
        type: 'component',
        id: 'dashboard-1',
        data: {
          id: 'dashboard-1',
          category: 'Dashboard',
          type: 'AnalyticalCard',
          title: 'Sales Trend'
        }
      } as any,
      {
        type: 'component',
        id: 'program-1',
        data: {
          id: 'program-1',
          category: 'Computer',
          type: 'program',
          status: 'success',
          output: '{"ok":true}'
        }
      } as any
    ])

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      id: 'program-1',
      data: {
        title: 'Run program',
        status: 'success',
        output: '{"ok":true}'
      }
    })
    expect(items[1].id).toBe('dashboard-1')
  })

  it('extracts trace components from chatkit public log events', () => {
    const item = extractChatBiTraceItemFromLogEvent({
      __xpaiChatKit: true,
      type: 'event',
      event: 'public_event',
      data: [
        'log',
        {
          id: 'dashboard-1',
          type: 'component',
          data: {
            id: 'dashboard-1',
            category: 'Dashboard',
            type: 'AnalyticalCard',
            title: 'Sales Trend'
          }
        }
      ]
    })

    expect(item).toMatchObject({
      id: 'dashboard-1',
      data: {
        category: 'Dashboard',
        type: 'AnalyticalCard'
      }
    })
  })

  it('extracts trace components from typed onLog detail payloads', () => {
    const item = extractChatBiTraceItemFromLogEvent({
      name: 'thread.item.widget',
      data: {
        item: {
          id: 'dashboard-2',
          type: 'component',
          data: {
            id: 'dashboard-2',
            category: 'Dashboard',
            type: 'AnalyticalCard',
            title: 'Profit Trend'
          }
        }
      }
    })

    expect(item).toMatchObject({
      id: 'dashboard-2',
      data: {
        category: 'Dashboard',
        type: 'AnalyticalCard'
      }
    })
  })
})
