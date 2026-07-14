import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ArtifactShareAuthComponent } from './artifact-share-auth.component'

describe('ArtifactShareAuthComponent', () => {
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, TranslateModule.forRoot(), ArtifactShareAuthComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ artifactLinkSlug: 'private slug' }),
              queryParamMap: convertToParamMap({})
            }
          }
        }
      ]
    })

    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('creates the share session on the Artifact origin with credentials', () => {
    const fixture = TestBed.createComponent(ArtifactShareAuthComponent)
    fixture.detectChanges()

    const request = httpMock.expectOne(`${window.location.origin}/api/artifacts/share-session/private%20slug`)
    expect(request.request.method).toBe('POST')
    expect(request.request.withCredentials).toBe(true)

    request.flush({}, { status: 500, statusText: 'Unavailable' })
  })
})
