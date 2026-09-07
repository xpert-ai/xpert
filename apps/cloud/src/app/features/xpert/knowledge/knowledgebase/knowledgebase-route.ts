import { IKnowledgebase, isDocumentKnowledgebaseType, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'

type KnowledgebaseRouteTarget = {
  id: string
  type?: KnowledgebaseTypeEnum | null
}

export function getKnowledgebaseDefaultRoute(knowledgebase: KnowledgebaseRouteTarget): string[] {
  const route = ['/xpert/knowledges', knowledgebase.id]
  if (knowledgebase.type === KnowledgebaseTypeEnum.FAQ) return [...route, 'faq']
  if (isDocumentKnowledgebaseType(knowledgebase.type)) return [...route, 'documents']
  return route
}

export function isKnowledgebaseWikiEnabled(
  knowledgebase: Partial<Pick<IKnowledgebase, 'wikiConfig'>> | null | undefined
): boolean {
  return knowledgebase?.wikiConfig?.enabled === true
}
