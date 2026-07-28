import { EntityType } from '@xpert-ai/ocap-core'
import { markdownEntityType } from './utils'

describe('markdownEntityType', () => {
  it('should create', () => {
    const entityType = {
      name: 'SalesOrder',
      properties: {
        amount: {
          name: 'amount',
          caption: 'Amount'
        }
      }
    } as EntityType

    expect(markdownEntityType(entityType)).toContain('SalesOrder')
  })
})
