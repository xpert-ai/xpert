import { EntitySet } from '@xpert-ai/ocap-core'
import { isEmpty, isNil, lowerCase } from 'lodash-es'

declare var monaco: any

export function createTableSuggestions(model: any, position: any, entitySets: Array<EntitySet>) {
  const word = model.getWordUntilPosition(position)
  let from = null
  let startColumn = word.startColumn
  while (!from?.word && startColumn > 0) {
    from = model.getWordUntilPosition(new monaco.Position(position.lineNumber, --startColumn))
  }

  if (!isNil(from?.word) && lowerCase(from.word) === 'from') {
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      // startColumn: word.startColumn,
      // endColumn: word.endColumn,
      startColumn: word.startColumn,
      endColumn: word.endColumn + 1,
    }
    return entitySets?.map(entity => ({
        label: entity.name,
        kind: monaco.languages.CompletionItemKind.Method,
        detail: entity.name,
        insertText: entity.name,
        range: range,
    }))
  }

  return null
}

export function createFieldSuggestions(range, entitySets: Array<EntitySet>): any[] {
  const proposals = []
  
  proposals.push({
    label: ``,
    kind: monaco.languages.CompletionItemKind.Method,
    detail: ``,
    insertText: ``,
    range: range,
  })

  entitySets?.forEach(entity => proposals.push({
    label: entity.name,
    kind: monaco.languages.CompletionItemKind.Method,
    detail: ``,
    insertText: entity.name,
    range: range,
  }))

  return proposals
}

export const createInfoProvider = (entitySets: Array<EntitySet>): any => {
  return {
    triggerCharacters: [' ', '.', 'abcd'],
    provideCompletionItems: (model: any, position: any) => {
      const suggestions = createTableSuggestions(model, position, entitySets)
      if (!isEmpty(suggestions)) {
        return {
          suggestions
        }
      }
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        // startColumn: word.startColumn,
        // endColumn: word.endColumn,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }
      return {
        suggestions: createFieldSuggestions(range, entitySets),
      }
    },
  }
}