import { environment } from '@cloud/environments/environment'
import { RequestScopeLevel } from '../@core/types'
import { getFeatureMenus } from './menus'

describe('feature menus', () => {
  const originalCodeXpertUrl = environment.CODE_XPERT_URL
  const originalDataXpertUrl = environment.DATA_XPERT_URL
  const originalResearchXpertUrl = environment.RESEARCH_XPERT_URL

  afterEach(() => {
    environment.CODE_XPERT_URL = originalCodeXpertUrl
    environment.DATA_XPERT_URL = originalDataXpertUrl
    environment.RESEARCH_XPERT_URL = originalResearchXpertUrl
  })

  it('uses public product links by default', () => {
    expect(findMenuLink('CodeXpert')).toBe('https://code.xpertai.cn/')
    expect(findMenuLink('DeepResearch')).toBe('https://research.xpertai.cn/')
    expect(findMenuLink('Data & Ontology')).toBe('https://data.xpertai.cn/')
  })

  it('uses configured product links and falls back per missing value', () => {
    environment.CODE_XPERT_URL = 'https://10.12.18.5:9441/'
    environment.DATA_XPERT_URL = 'https://10.12.18.5:9443/home'
    environment.RESEARCH_XPERT_URL = ''

    expect(findMenuLink('CodeXpert')).toBe('https://10.12.18.5:9441/')
    expect(findMenuLink('Data & Ontology')).toBe('https://10.12.18.5:9443/home')
    expect(findMenuLink('DeepResearch')).toBe('https://research.xpertai.cn/')
  })

  it('falls back when production placeholders are not replaced', () => {
    environment.CODE_XPERT_URL = 'DOCKER_CODE_XPERT_URL'
    environment.DATA_XPERT_URL = 'DOCKER_DATA_XPERT_URL'
    environment.RESEARCH_XPERT_URL = 'DOCKER_RESEARCH_XPERT_URL'

    expect(findMenuLink('CodeXpert')).toBe('https://code.xpertai.cn/')
    expect(findMenuLink('Data & Ontology')).toBe('https://data.xpertai.cn/')
    expect(findMenuLink('DeepResearch')).toBe('https://research.xpertai.cn/')
  })
})

function findMenuLink(title: string) {
  return getFeatureMenus(RequestScopeLevel.ORGANIZATION, null).find((item) => item.title === title)?.link
}
