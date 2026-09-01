import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import type { TXpertProjectAccessSummary } from '@xpert-ai/contracts'
import { XpertProjectApiService } from './project-api.service'

describe('XpertProjectApiService', () => {
  let service: XpertProjectApiService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] })
    service = TestBed.inject(XpertProjectApiService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => httpMock.verify())

  it('loads the current user access summary for a Project', () => {
    let result: TXpertProjectAccessSummary | undefined
    service.access('project-1').subscribe((access) => (result = access))

    const request = httpMock.expectOne('/api/xpert-project/project-1/access')
    expect(request.request.method).toBe('GET')
    request.flush({
      role: 'member',
      capabilities: { canRead: true, canEdit: false, canManage: false, canUse: true }
    })

    expect(result).toEqual({
      role: 'member',
      capabilities: { canRead: true, canEdit: false, canManage: false, canUse: true }
    })
  })

  it('reads and updates Project instructions through the Content API', () => {
    service.instructions('project-1').subscribe()
    const readRequest = httpMock.expectOne('/api/xpert-project/project-1/content/instructions')
    expect(readRequest.request.method).toBe('GET')
    readRequest.flush({ content: 'Current instructions' })

    service.updateInstructions('project-1', 'Updated instructions').subscribe()
    const updateRequest = httpMock.expectOne('/api/xpert-project/project-1/content/instructions')
    expect(updateRequest.request.method).toBe('PUT')
    expect(updateRequest.request.body).toEqual({ content: 'Updated instructions' })
    updateRequest.flush({ content: 'Updated instructions' })
  })

  it('uses the Project Content endpoints for skill mutations', () => {
    service.installSkill('project-1', 'index-1').subscribe()
    const installRequest = httpMock.expectOne('/api/xpert-project/project-1/content/skills/install')
    expect(installRequest.request.method).toBe('POST')
    expect(installRequest.request.body).toEqual({ indexId: 'index-1' })
    installRequest.flush({})

    service.setSkillEnabled('project-1', 'pdf', false).subscribe()
    const enabledRequest = httpMock.expectOne('/api/xpert-project/project-1/content/skills')
    expect(enabledRequest.request.method).toBe('PATCH')
    expect(enabledRequest.request.body).toEqual({ skillId: 'pdf', enabled: false })
    enabledRequest.flush({})

    service.uninstallSkill('project-1', 'pdf').subscribe()
    const uninstallRequest = httpMock.expectOne(
      (request) =>
        request.url === '/api/xpert-project/project-1/content/skills' && request.params.get('skillId') === 'pdf'
    )
    expect(uninstallRequest.request.method).toBe('DELETE')
    uninstallRequest.flush(null)
  })

  it('uploads a Project skill package as multipart form data', () => {
    const file = new File(['skill'], 'skill.zip', { type: 'application/zip' })

    service.uploadSkills('project-1', file).subscribe()

    const request = httpMock.expectOne('/api/xpert-project/project-1/content/skills/upload')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toBeInstanceOf(FormData)
    expect(request.request.body.get('file')).toBe(file)
    request.flush([])
  })
})
