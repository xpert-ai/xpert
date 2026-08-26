import { HttpClient } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap } from '@angular/router'
import { of } from 'rxjs'
import { XP_API_BASE_URL } from '../auth.options'
import { OidcConsentComponent } from './consent.component'

describe('OidcConsentComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.restoreAllMocks()
  })

  async function createFixture(
    queryParams: Record<string, string>,
    details = {
      clientId: 'chatkit',
      clientName: 'ChatKit',
      scopes: ['openid', 'profile', 'email'],
      resources: ['http://localhost:3000/api/mcp/p/cut']
    }
  ) {
    const get = jest.fn(() => of(details))
    await TestBed.configureTestingModule({
      declarations: [OidcConsentComponent],
      providers: [
        { provide: XP_API_BASE_URL, useValue: 'http://localhost:3000/' },
        {
          provide: HttpClient,
          useValue: { get }
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(queryParams)
            }
          }
        }
      ]
    })
      .overrideComponent(OidcConsentComponent, {
        set: {
          template: ''
        }
      })
      .compileComponents()

    const fixture = TestBed.createComponent(OidcConsentComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return { component: fixture.componentInstance, get }
  }

  it('shows the requesting client, scopes, and MCP resources from the interaction URL', async () => {
    const { component, get } = await createFixture(
      {
        interaction: 'interaction-1'
      },
      {
        clientId: 'chatkit',
        clientName: 'ChatKit',
        scopes: ['openid', 'profile', 'email'],
        resources: ['http://localhost:3000/api/mcp/p/cut', 'http://localhost:3000/api/mcp/p/media']
      }
    )

    expect(get).toHaveBeenCalledWith('http://localhost:3000/oidc/interaction/interaction-1/consent', {
      withCredentials: true
    })
    expect(component.clientName).toBe('ChatKit')
    expect(component.clientId).toBe('chatkit')
    expect(component.scopes).toEqual(['openid', 'profile', 'email'])
    expect(component.resources).toEqual([
      'http://localhost:3000/api/mcp/p/cut',
      'http://localhost:3000/api/mcp/p/media'
    ])
  })

  it('submits an explicit allow decision to the provider interaction endpoint', async () => {
    const { component } = await createFixture({
      interaction: 'interaction/1'
    })
    const submit = jest.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation()

    component.allow()

    expect(submit).toHaveBeenCalledTimes(1)
    const form = submit.mock.instances[0] as HTMLFormElement
    expect(form.method).toBe('post')
    expect(form.action).toBe('http://localhost:3000/oidc/interaction/interaction%2F1/consent')
    expect(form.querySelector<HTMLInputElement>('input[name="decision"]')?.value).toBe('allow')
  })

  it('does not submit when the interaction identifier is missing', async () => {
    const { component, get } = await createFixture({})
    const submit = jest.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation()

    component.deny()

    expect(get).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
  })
})
