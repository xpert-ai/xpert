import {
  filterBlankTemplates,
  getBlankTemplateCategories,
  normalizeBlankTemplateCategory
} from './blank-template-selection.util'

describe('blank template selection util', () => {
  const templates = [
    {
      id: 'operations-template',
      name: 'operations-template',
      title: 'Operations Template',
      description: 'Operations workflow starter',
      category: ' Operations '
    },
    {
      id: 'sales-template',
      name: 'sales-template',
      title: 'Sales Template',
      description: 'Sales assistant starter',
      category: 'Sales'
    }
  ]

  it('normalizes categories before building the category list', () => {
    expect(normalizeBlankTemplateCategory(' Operations ')).toBe('Operations')
    expect(normalizeBlankTemplateCategory('   ')).toBeNull()
    expect(getBlankTemplateCategories(templates)).toEqual(['Operations', 'Sales'])
  })

  it('filters templates to the provided fixed category', () => {
    expect(
      filterBlankTemplates(templates, {
        category: 'Operations'
      }).map(({ id }) => id)
    ).toEqual(['operations-template'])
  })

  it('keeps all categories available when no fixed category is provided and supports search', () => {
    expect(
      filterBlankTemplates(templates, {
        category: 'all'
      }).map(({ id }) => id)
    ).toEqual(['operations-template', 'sales-template'])

    expect(
      filterBlankTemplates(templates, {
        category: 'all',
        search: 'sales'
      }).map(({ id }) => id)
    ).toEqual(['sales-template'])
  })
})
