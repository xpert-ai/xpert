import { inject } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'

const PREFIX = 'XP.Knowledgebase.WorkspaceConfiguration'

export function createSeparatorSelectOptions() {
  const translate = inject(TranslateService)
  const separatorOptions = [
    { value: '\\n\\n', labelKey: 'Chunk.SeparatorLabels.DoubleNewline' },
    { value: '\\n', labelKey: 'Chunk.SeparatorLabels.SingleNewline' },
    { value: '。', labelKey: 'Chunk.SeparatorLabels.ChinesePeriod' },
    { value: '！', labelKey: 'Chunk.SeparatorLabels.Exclamation' },
    { value: '？', labelKey: 'Chunk.SeparatorLabels.Question' },
    { value: '；', labelKey: 'Chunk.SeparatorLabels.ChineseSemicolon' },
    { value: ';', labelKey: 'Chunk.SeparatorLabels.EnglishSemicolon' }
  ]

  const compareSeparators = (left: unknown, right: unknown) =>
    typeof left === 'string' && typeof right === 'string'
      ? left.replace(/\n/g, '\\n') === right.replace(/\n/g, '\\n')
      : left === right
  const displaySeparator = (value: unknown) => {
    if (typeof value !== 'string') return ''
    const escaped = value.replace(/\n/g, '\\n')
    const option = separatorOptions.find((option) => option.value === escaped)
    return option ? translate.instant(`${PREFIX}.${option.labelKey}`) : JSON.stringify(value)
  }

  const separatorTagOptions = separatorOptions.map((option) => ({
    value: option.value,
    label: translate.instant(`${PREFIX}.${option.labelKey}`)
  }))

  function separatorLabelKey(value: string) {
    const key = separatorOptions.find((option) => option.value === value)?.labelKey
    return key ? `${PREFIX}.${key}` : value
  }

  return { separatorOptions, compareSeparators, displaySeparator, separatorTagOptions, separatorLabelKey }
}
