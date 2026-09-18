import { AbstractControl, ValidationErrors } from '@angular/forms'

export const WORKFLOW_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

export const PROMPT_WORKFLOW_TEMPLATES: Array<{
  name: string
  label: string
  description: string
  argsHint: string
  template: string
  tags: string[]
}> = [
  {
    name: 'review',
    label: 'Review',
    description: 'Review selected context and return actionable findings.',
    argsHint: '<path or context>',
    template: 'Review {{args}}. Return actionable findings grouped by severity.',
    tags: ['code', 'quality']
  },
  {
    name: 'explain',
    label: 'Explain',
    description: 'Explain a file, query, error, or concept.',
    argsHint: '<target>',
    template: 'Explain {{args}} clearly. Include the relevant assumptions and edge cases.',
    tags: ['learning']
  },
  {
    name: 'test',
    label: 'Test',
    description: 'Design or update tests for the selected target.',
    argsHint: '<path or feature>',
    template: 'Create or update tests for {{args}}. Focus on meaningful behavior and regressions.',
    tags: ['test', 'quality']
  },
  {
    name: 'debug',
    label: 'Debug',
    description: 'Debug an error, failing test, or unexpected behavior.',
    argsHint: '<error or context>',
    template: 'Debug {{args}}. Identify likely causes, propose checks, and suggest a minimal fix.',
    tags: ['debug']
  },
  {
    name: 'summarize',
    label: 'Summarize',
    description: 'Summarize long context into a compact brief.',
    argsHint: '<context>',
    template: 'Summarize {{args}} into concise bullets with open questions and decisions.',
    tags: ['writing']
  },
  {
    name: 'rewrite',
    label: 'Rewrite',
    description: 'Rewrite content for clarity, tone, or structure.',
    argsHint: '<content>',
    template: 'Rewrite {{args}} for clarity. Preserve meaning and call out important changes.',
    tags: ['writing']
  }
]

export function splitPromptList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ]
}

export function promptTextValidator(control: AbstractControl): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim() ? null : { required: true }
}
