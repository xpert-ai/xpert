import type { Router } from '@angular/router'
import { navigateProjectEntry } from './project-entry'
import { chatProjectCreateRequest } from './project-chat-create'

it('opens the Case view inside the persisted Project route', async () => {
  const navigate = jest.fn(async () => true)
  const router = { navigate } as Pick<Router, 'navigate'> as Router
  await navigateProjectEntry(router, {
    kind: 'assistant',
    xpertId: 'assistant',
    slug: 'automotive',
    projectId: 'project',
    viewKey: 'auto__cases',
    selectionId: 'case'
  })
  expect(navigate).toHaveBeenCalledWith(['/chat/x', 'automotive', 'p', 'project', 'c'], {
    queryParams: { view: 'auto__cases', viewSelection: 'case' }
  })
  await navigateProjectEntry(router, {
    kind: 'assistant',
    xpertId: 'assistant',
    slug: 'automotive',
    viewKey: 'auto__cases'
  })
  expect(navigate).toHaveBeenLastCalledWith(['/chat/x', 'automotive', 'c'], {
    queryParams: { view: 'auto__cases', viewSelection: undefined }
  })
})

it('accepts typed creation effects and rejects malformed classifications', () => {
  const projectType = { applicationKey: 'automotive:operations', projectTypeKey: 'case' }
  expect(chatProjectCreateRequest({ name: 'project.create-entry', data: projectType })).toEqual({
    kind: 'entry',
    projectType
  })
  expect(chatProjectCreateRequest({ name: 'project.create', data: { name: ' Automotive ', projectType } })).toEqual({
    kind: 'create',
    name: 'Automotive',
    projectType
  })
  expect(
    chatProjectCreateRequest({
      name: 'project.create',
      data: { name: 'Automotive', projectType: { applicationKey: 'automotive' } }
    })
  ).toBeNull()
})
