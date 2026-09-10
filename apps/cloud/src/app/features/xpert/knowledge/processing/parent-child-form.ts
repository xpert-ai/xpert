import { computed } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, Validators } from '@angular/forms'
import { DocumentChunkSplitOptions, DocumentParentChildParserConfig } from '@xpert-ai/contracts'
import { map } from 'rxjs'

/** Decode the built-in splitter's configuration at the persisted JSON boundary. */
function readSplitOptions(value: unknown): DocumentChunkSplitOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return {
    separators:
      'separators' in value &&
      Array.isArray(value.separators) &&
      value.separators.every((item): item is string => typeof item === 'string')
        ? value.separators
        : undefined,
    separator: 'separator' in value && typeof value.separator === 'string' ? value.separator : undefined,
    maxChars: 'maxChars' in value && typeof value.maxChars === 'number' ? value.maxChars : undefined
  }
}

function readParentChildConfig(value: unknown): DocumentParentChildParserConfig {
  const parent = value && typeof value === 'object' && 'parent' in value ? value.parent : undefined
  const child = value && typeof value === 'object' && 'child' in value ? value.child : undefined
  return {
    parent: {
      ...readSplitOptions(parent),
      mode: parent && typeof parent === 'object' && 'mode' in parent && parent.mode === 'full' ? 'full' : 'paragraph'
    },
    child: readSplitOptions(child)
  }
}

function initialSeparators(options: DocumentChunkSplitOptions, fallback: string): string[] {
  if (options.separators) return [...options.separators]
  // The legacy field only decoded newlines; preserve other literal escapes when migrating to a list.
  const separator = (options.separator || fallback).replace(/\\n/g, '\n')
  return [separator.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')]
}

export function createParentChildChunkForm(initialValue: unknown) {
  const initial = readParentChildConfig(initialValue)
  const limits = [
    Validators.required,
    Validators.min(1),
    Validators.max(Number.MAX_SAFE_INTEGER),
    Validators.pattern(/^\d+$/)
  ]
  const fields = new FormGroup({
    parent: new FormGroup({
      mode: new FormControl<'paragraph' | 'full'>(initial.parent.mode, {
        nonNullable: true,
        validators: Validators.required
      }),
      separators: new FormControl(initialSeparators(initial.parent, '\\n\\n'), { nonNullable: true }),
      maxChars: new FormControl<number | null>(initial.parent.maxChars ?? 1000, limits)
    }),
    child: new FormGroup({
      separators: new FormControl(initialSeparators(initial.child, '\\n'), { nonNullable: true }),
      maxChars: new FormControl<number | null>(initial.child.maxChars ?? 200, limits)
    })
  })
  const value = toSignal(fields.valueChanges.pipe(map(() => fields.getRawValue())), {
    initialValue: fields.getRawValue()
  })
  const parentMode = computed(() => value().parent.mode)
  const config = computed<DocumentParentChildParserConfig>(() => ({
    parent:
      parentMode() === 'full'
        ? { mode: 'full' }
        : {
            mode: value().parent.mode,
            separators: [...value().parent.separators],
            maxChars: value().parent.maxChars ?? undefined
          },
    child: {
      separators: [...value().child.separators],
      maxChars: value().child.maxChars ?? undefined
    }
  }))
  const invalid = computed(() => {
    const current = value()
    return (
      fields.controls.child.invalid ||
      fields.controls.parent.controls.mode.invalid ||
      (current.parent.mode === 'paragraph' && fields.controls.parent.invalid)
    )
  })
  return { fields, controls: fields.controls, config, invalid, parentMode }
}

export type ParentChildChunkForm = ReturnType<typeof createParentChildChunkForm>
