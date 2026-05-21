import { environment } from '../../environments/environment'

const DEFAULT_CODE_XPERT_URL = 'https://code.xpertai.cn/'
const DEFAULT_DATA_XPERT_URL = 'https://data.xpertai.cn/'
const DEFAULT_RESEARCH_XPERT_URL = 'https://research.xpertai.cn/'

export function codeXpertUrl() {
  return resolveProductUrl(environment.CODE_XPERT_URL, DEFAULT_CODE_XPERT_URL)
}

export function dataXpertUrl() {
  return resolveProductUrl(environment.DATA_XPERT_URL, DEFAULT_DATA_XPERT_URL)
}

export function researchXpertUrl() {
  return resolveProductUrl(environment.RESEARCH_XPERT_URL, DEFAULT_RESEARCH_XPERT_URL)
}

function resolveProductUrl(value: string | undefined, fallback: string) {
  return value && value.trim() && !value.startsWith('DOCKER_') ? value.trim() : fallback
}
