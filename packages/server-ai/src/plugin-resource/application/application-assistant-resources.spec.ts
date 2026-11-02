import { applicationAssistantResources } from './application-assistant-resources'

describe('installed App Assistant resources', () => {
  const main = '00000000-0000-4000-8000-000000000001'
  const writer = '00000000-0000-4000-8000-000000000002'
  const reviewer = '00000000-0000-4000-8000-000000000003'

  it('includes the main Assistant and every independently installed role Assistant', () => {
    expect(applicationAssistantResources({ resourceRefs: { 'role:writer': writer, assistant: main, 'role:reviewer': reviewer } }))
      .toEqual([{ key: 'assistant', id: main }, { key: 'role:reviewer', id: reviewer }, { key: 'role:writer', id: writer }])
  })

  it('excludes other resource kinds and malformed Assistant references', () => {
    expect(applicationAssistantResources({ resourceRefs: {
      'knowledgebase:documents': main, 'toolset:search': writer, 'assistant-copy': main,
      'role:': reviewer, 'role:writer': 'not-a-resource-id', assistant: main
    } })).toEqual([{ key: 'assistant', id: main }])
  })

  it('does not invent Assistants before an installation has resource references', () => {
    expect(applicationAssistantResources({})).toEqual([])
  })
})
