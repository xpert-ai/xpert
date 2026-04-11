import { EntityType, ParameterProperty, getEntityProperty, parameterFormatter } from '@xpert-ai/ocap-core'

export function replaceParameters(title: string, entityType: EntityType): string {
  if (entityType && title) {
    const myRegexp = new RegExp('\\[@(.*?)\\]', 'g')
    let match = myRegexp.exec(title)
    while (match !== null) {
      const paramName = match[1]
      title = title.replace(
        parameterFormatter(paramName),
        (getEntityProperty<ParameterProperty>(entityType, paramName)?.value as string) ?? paramName
      )
      match = myRegexp.exec(title)
    }
  }

  return title
}
