export type BlankTemplateSearchable = {
  id: string
  name: string
  title?: string | null
  description?: string | null
  category?: string | null
}

export function normalizeBlankTemplateCategory(category: string | null | undefined): string | null {
  const value = category?.trim()
  return value ? value : null
}

export function getBlankTemplateCategories<T extends BlankTemplateSearchable>(templates: T[]): string[] {
  return Array.from(
    new Set(
      templates
        .map((template) => normalizeBlankTemplateCategory(template.category))
        .filter((value): value is string => !!value)
    )
  )
}

export function filterBlankTemplates<T extends BlankTemplateSearchable>(
  templates: T[],
  options: {
    category?: string | null
    search?: string | null
  }
): T[] {
  const category = options.category ?? 'all'
  const search = options.search?.trim().toLowerCase() ?? ''

  return templates.filter((template) => {
    if (category !== 'all' && normalizeBlankTemplateCategory(template.category) !== category) {
      return false
    }

    if (!search) {
      return true
    }

    return [template.title, template.name, template.description]
      .filter((value): value is string => !!value)
      .some((value) => value.toLowerCase().includes(search))
  })
}
