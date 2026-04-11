import {
  AggregationRole,
  C_MEASURES,
  EntityType,
  getEntityDimensionAndHierarchies,
  isMeasureControlProperty,
  Property,
  PropertyAttributes,
  PropertyHierarchy
} from '@xpert-ai/ocap-core'
import { isEmpty, isNil, lowerCase } from 'lodash-es'
import { FUNCTIONS, SUFFIX_FUNCTIONS } from '../reference'
import { C_MDX_FIELD_NAME_REGEX } from '../types'

declare var monaco: any

export const functionProposals = {
  provideCompletionItems: (model: any, position: any) => {
    const word = model.getWordUntilPosition(position)
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn
    }
    return {
      suggestions: FUNCTIONS.map((item) => {
        return {
          ...item,
          kind: monaco.languages.CompletionItemKind.Function,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: item.expression,
          documentation: `${item.expression}\n${item.documentation}`,
          range: range
        }
      })
    }
  }
}

export function createCubeSuggestions(model: any, position: any, entityType: EntityType) {
  const word = model.getWordUntilPosition(position)
  let from = null
  let startColumn = word.startColumn - 1
  while (!from?.word && startColumn > 0) {
    from = model.getWordUntilPosition(new monaco.Position(position.lineNumber, --startColumn))
  }

  if (!isNil(from?.word) && lowerCase(from.word) === 'from') {
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      // startColumn: word.startColumn,
      // endColumn: word.endColumn,
      startColumn: word.startColumn - 1,
      endColumn: word.endColumn + 1
    }
    return [
      {
        label: `[${entityType.name}]`,
        kind: monaco.languages.CompletionItemKind.Method,
        detail: ``,
        insertText: `[${entityType.name}]`,
        range: range
      }
    ]
  }

  return null
}

export const createHierarchyProvider = (entityType: EntityType): any => {
  return {
    triggerCharacters: ['['],
    provideCompletionItems: (model: any, position: any) => {
      const suggestions = createCubeSuggestions(model, position, entityType)
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
        startColumn: word.startColumn - 1,
        endColumn: word.endColumn + 1
      }
      return {
        suggestions: createFieldProposals(range, entityType)
      }
    }
  }
}

export function createFieldProposals(range, entityType: EntityType): any[] {
  const proposals = []
  Object.values(entityType.properties)
    .filter(
      (property) =>
        property.role === AggregationRole.dimension || property.role === AggregationRole.measure
    )
    .forEach((property) => {
      const text =
        property.role === AggregationRole.measure ? `[${C_MEASURES}].[${property.name}]` : property.name
      proposals.push({
        label: text,
        kind:
          property.role === AggregationRole.dimension
            ? monaco.languages.CompletionItemKind.Method
            : property.role === AggregationRole.measure
            ? monaco.languages.CompletionItemKind.Unit
            : monaco.languages.CompletionItemKind.Field,
        detail: property.caption,
        insertText: text,
        range: range
      })

      property.hierarchies?.forEach((hierarchy) => {
        const dimension = proposals.find((item) => item.insertText === hierarchy.name)
        // 不存在相同名称的 Dimension 时再加入
        if (!dimension) {
          proposals.push({
            label: hierarchy.name,
            kind: monaco.languages.CompletionItemKind.Class,
            detail: property.caption + ' ' + hierarchy.caption,
            insertText: hierarchy.name,
            range: range
          })
        }
      })
    })
  proposals.push({
    label: `[${C_MEASURES}]`,
    kind: monaco.languages.CompletionItemKind.Method,
    detail: ``,
    insertText: `[${C_MEASURES}]`,
    range: range
  })
  return proposals
}

export const createSuffixProvider = (entityType: EntityType) => {
  return {
    triggerCharacters: ['.'],
    provideCompletionItems: (model, position) => {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column - 1
      })

      const MDX_NAME_REGEX = `\\[(${C_MDX_FIELD_NAME_REGEX})\\]`
      const regExp = new RegExp(MDX_NAME_REGEX, 'g')

      let match
      let word
      do {
        match = regExp.exec(textUntilPosition)
        if (match?.length) {
          word = match[0]
        }
      } while (match)

      if (word) {
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column,
          endColumn: position.column
        }
        return {
          suggestions: createSuffixProposals(range, word, entityType)
        }
      }

      return null
    }
  }
}

function createSuffixProposals(range, parent: string, entityType: EntityType) {
  const proposals = []

  SUFFIX_FUNCTIONS.map((item) =>
    proposals.push({
      ...item,
      kind: monaco.languages.CompletionItemKind.Function,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: item.expression,
      range: range
    })
  )

  if (parent === `[${C_MEASURES}]`) {
    Object.values(entityType.properties)
      .filter((property) => property.role === AggregationRole.measure)
      .forEach((property) =>
        proposals.push({
          label: property.name,
          kind: monaco.languages.CompletionItemKind.Unit,
          detail: property.caption,
          insertText: `[${property.name}]`,
          range: range
        })
      )
    return proposals
  }

  let property: PropertyHierarchy = Object.values(entityType.properties).find((property) => property.name === parent)
  if (property) {
    if (property.role === AggregationRole.dimension) {
      property = (property as Property).hierarchies?.find((item) => item.name === parent)
    }
    property?.levels?.forEach((level) => {
      const text = level.name.replace(`${parent}.`, '')
      proposals.push({
        label: text,
        kind: monaco.languages.CompletionItemKind.Constant,
        detail: level.caption,
        insertText: text,
        range: range
      })
    })
  }
  return proposals
}

export const createHoverProvider = (entityType: EntityType) => {
  return {
    provideHover: (model: any, position: any, token: any) => {
      const line = model.getLineContent(position.lineNumber)

      const MDX_MEASURE_NAME_REGEX = `\\[(${C_MDX_FIELD_NAME_REGEX})\\]`
      const regExp = new RegExp(MDX_MEASURE_NAME_REGEX, 'g')

      let match
      let word
      do {
        match = regExp.exec(line)
        if (match?.length && match.index <= position.column && match.index + match[0].length >= position.column) {
          word = match[0]
          break
        }
      } while (match)

      // dimension or hierarchy
      if (word) {
        return {
          range: new monaco.Range(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount())),
          contents: getFieldHoverDocument(word, entityType)
        }
      } else {
        // mdx function
        word = model.getWordAtPosition(position)?.word
        if (word) {
          return {
            range: new monaco.Range(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount())),
            contents: getFunctionHoverDocument(word)
          }
        }
      }

      return {
        range: new monaco.Range(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount())),
        contents: [
          { value: 'Filter(**Set_Expression**, **Logical_Expression**)' },
          {
            value:
              'Returns the set that results from filtering a specified set based on a search condition.\n\n`Filter(Set_Expression, Logical_Expression)`'
          }
        ]
      }
    }
  }
}

function getFieldHoverDocument(name: string, entityType: EntityType) {
  const property = getEntityDimensionAndHierarchies(entityType).find((property) => property.name === name)
  return property ? [{ value: `\`${property.name}\`` }, { value: property.caption }] : []
}

function getFunctionHoverDocument(name: string) {
  const item = FUNCTIONS.find((item) => item.label.toLocaleLowerCase() === name.toLocaleLowerCase())

  return item ? [{ value: `\`${item.expression}\`
${item.documentation}` }] : []
}

export const createSignatureHelpProvider = () => {
  return {
    signatureHelpTriggerCharacters: ['('],
    signatureHelpRetriggerCharacters: ['('],

    /**
     * Provide help for the signature at the given position and document.
     */
    provideSignatureHelp: (
      model: any,
      position: any,
      token: any,
      context: any
    ): any => {
      var textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      })

      var match = textUntilPosition.match('\\(')

      // if (match) {
      return {
        value: {
          signatures: [
            {
              label: 'parameter1',
              documentation: ' this method does blah',
              parameters: [
                {
                  label: 'ParamInfo1',
                  documentation: 'this param does blah'
                }
              ]
            }
          ],
          activeSignature: 1,
          activeParameter: 1
        },
        dispose(): void {}
      }
      // }
      // return null
    }
  }
}

/** @type {languages.SemanticTokensLegend} */
const legend = {
  tokenTypes: [
    'comment',
    'string',
    'keyword',
    'number',
    'regexp',
    'operator',
    'namespace',
    'type',
    'struct',
    'class',
    'interface',
    'enum',
    'typeParameter',
    'function',
    'member',
    'macro',
    'variable',
    'parameter',
    'property',
    'label'
  ],
  tokenModifiers: [
    'declaration',
    'documentation',
    'readonly',
    'static',
    'abstract',
    'deprecated',
    'modification',
    'async'
  ]
}

/** @type {(type: string)=>number} */
function getType(type) {
  return legend.tokenTypes.indexOf(type)
}

// /** @type {(modifier: string[]|string|null)=>number} */
// function getModifier(modifiers) {
//   if (typeof modifiers === 'string') {
//       modifiers = [modifiers];
//   }
//   if (Array.isArray(modifiers)) {
//       let nModifiers = 0;
//       for (let modifier of modifiers) {
//           nModifier = legend.tokenModifiers.indexOf(modifier);
//           if (nModifier > -1) {
//               nModifiers |= (1 << nModifier) >>> 0;
//           }
//       }
//       return nModifiers;
//   } else {
//       return 0;
//   }
// }

// const tokenPattern = new RegExp('(?<=\\[)([a-zA-Z]+)((?:\\.[a-zA-Z]+)*)(?=\\])', 'g');

// export const createDocumentSemanticTokensProvider = (entityType: EntityType) => {
//   return {
//     getLegend: () => {
//         return legend;
//     },
//     provideDocumentSemanticTokens: (model, lastResultId, token) => {
//       const lines = model.getLinesContent()

//       /** @type {number[]} */
//       const data = [];

//       let prevLine = 0;
//       let prevChar = 0;

//       for (let i = 0; i < lines.length; i++) {
//           const line = lines[i];

//           for (let match = null; match = tokenPattern.exec(line);) {
//               // translate token and modifiers to number representations
//               let type = getType(match[1]);
//               if (type === -1) {
//                   continue;
//               }
//               let modifier = match[2].length ? 0 : 0;

//               data.push(
//                   // translate line to deltaLine
//                   i - prevLine,
//                   // for the same line, translate start to deltaStart
//                   prevLine === i ? match.index - prevChar : match.index,
//                   match[0].length,
//                   type,
//                   modifier
//               )

//               prevLine = i;
//               prevChar = match.index;
//           }
//       }

//       console.warn(data)

//       return {
//           data: new Uint32Array(data),
//           resultId: null
//       }
//     },
//     releaseDocumentSemanticTokens: (resultId) => { }
//   }
// }

export const createParameterProvider = (entityType: EntityType): any => {
  return {
    triggerCharacters: ['@', '[@'],
    provideCompletionItems: (model: any, position: any) => {
      const word = model.getWordUntilPosition(position)

      const triggerCharacter = model.getValueInRange({
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn - 2,
        endColumn: word.startColumn
      })

      const range =
        triggerCharacter === '[@'
          ? {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn - 2,
              endColumn: word.endColumn + 1
            }
          : {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn - 1,
              endColumn: word.endColumn
            }

      const parameters: PropertyAttributes[] = Object.keys(entityType.properties)
        .map((key) => entityType.properties[key])
        .filter((property) => isMeasureControlProperty(property))
      parameters.push(...Object.values(entityType.parameters || {}))
      return {
        suggestions: parameters.map((property) => ({
          label: `[@${property.name}]`,
          kind: monaco.languages.CompletionItemKind.Variable,
          detail: ``,
          insertText: `[@${property.name}]`,
          range: range
        }))
      }
    }
  }
}
