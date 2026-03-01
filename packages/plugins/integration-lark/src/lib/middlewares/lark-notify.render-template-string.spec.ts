import { renderTemplateString, renderTemplateValue } from './lark-notify.middleware'

describe('renderTemplateString', () => {
  const state = {
    runtime: {
      user: {
        name: 'Alice',
        age: 20
      },
      users: [{ name: 'Tom' }],
      profile: {
        level: 2
      },
      none: null,
      ok: true
    }
  } as Record<string, unknown>

  it('returns original value when template is disabled', () => {
    const result = renderTemplateString('Hi {{runtime.user.name}}', state, {
      enabled: false,
      strict: false
    })

    expect(result).toBe('Hi {{runtime.user.name}}')
  })

  it('returns original value when template syntax does not exist', () => {
    const result = renderTemplateString('plain text', state, {
      enabled: true,
      strict: false
    })

    expect(result).toBe('plain text')
  })

  it('returns original object value for full template match', () => {
    const result = renderTemplateString('{{ runtime.profile }}', state, {
      enabled: true,
      strict: false
    })

    expect(result).toEqual({ level: 2 })
  })

  it('returns original string for full template when variable is missing in non-strict mode', () => {
    const result = renderTemplateString('{{ runtime.missing }}', state, {
      enabled: true,
      strict: false
    })

    expect(result).toBe('{{ runtime.missing }}')
  })

  it('throws when full-template variable is missing in strict mode', () => {
    expect(() =>
      renderTemplateString('{{runtime.missing}}', state, {
        enabled: true,
        strict: true
      })
    ).toThrow("Template variable 'runtime.missing' is not found in current state")
  })

  it('renders inline templates with string/number/object/null/boolean and bracket path', () => {
    const result = renderTemplateString(
      'name={{runtime.user.name}}, age={{runtime.user.age}}, first={{runtime.users[0].name}}, profile={{runtime.profile}}, none={{runtime.none}}, ok={{runtime.ok}}',
      state,
      {
        enabled: true,
        strict: false
      }
    )

    expect(result).toBe('name=Alice, age=20, first=Tom, profile={"level":2}, none=, ok=true')
  })

  it('keeps missing inline variable as normalized placeholder in non-strict mode', () => {
    const result = renderTemplateString('Hi {{ runtime.missing }}', state, {
      enabled: true,
      strict: false
    })

    expect(result).toBe('Hi {{runtime.missing}}')
  })

  it('throws when inline variable is missing in strict mode', () => {
    expect(() =>
      renderTemplateString('Hi {{runtime.missing}}', state, {
        enabled: true,
        strict: true
      })
    ).toThrow("Template variable 'runtime.missing' is not found in current state")
  })
})

describe('renderTemplateValue', () => {
  const state = {
    runtime: {
      user: {
        name: 'Alice',
        age: 20
      },
      users: [{ name: 'Tom' }],
      profile: {
        level: 2
      },
      none: null
    }
  } as Record<string, unknown>

  it('returns non-string primitive values unchanged', () => {
    expect(renderTemplateValue(123, state, { enabled: true, strict: false })).toBe(123)
    expect(renderTemplateValue(true, state, { enabled: true, strict: false })).toBe(true)
    expect(renderTemplateValue(null, state, { enabled: true, strict: false })).toBeNull()
  })

  it('renders nested object and array values recursively', () => {
    const input = {
      title: 'Hi {{runtime.user.name}}',
      profile: '{{runtime.profile}}',
      items: ['{{runtime.users[0].name}}', 'Age={{runtime.user.age}}', 1]
    }

    const result = renderTemplateValue(input, state, { enabled: true, strict: false }) as any

    expect(result).toEqual({
      title: 'Hi Alice',
      profile: { level: 2 },
      items: ['Tom', 'Age=20', 1]
    })
  })

  it('keeps template content unchanged when rendering is disabled', () => {
    const input = {
      title: 'Hi {{runtime.user.name}}',
      list: ['{{runtime.users[0].name}}']
    }

    const result = renderTemplateValue(input, state, { enabled: false, strict: false })
    expect(result).toEqual(input)
  })

  it('keeps missing placeholders in non-strict mode', () => {
    const input = {
      title: 'Hi {{ runtime.missing }}',
      full: '{{runtime.missing}}'
    }

    const result = renderTemplateValue(input, state, { enabled: true, strict: false })
    expect(result).toEqual({
      title: 'Hi {{runtime.missing}}',
      full: '{{runtime.missing}}'
    })
  })

  it('throws when nested variable is missing in strict mode', () => {
    const input = {
      title: 'Hi {{runtime.user.name}}',
      deep: {
        value: '{{runtime.missing}}'
      }
    }

    expect(() => renderTemplateValue(input, state, { enabled: true, strict: true })).toThrow(
      "Template variable 'runtime.missing' is not found in current state"
    )
  })
})
