import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLUGIN_RESOURCE_ERROR_CODE } from '@xpert-ai/contracts'
import { resolveTemplatePluginSkillInstallError } from './blank-plugin-resource-error.util'

describe('blank plugin resource error localization', () => {
  it('maps the plugin resource error code from an HTTP error response', () => {
    expect(
      resolveTemplatePluginSkillInstallError({
        error: { errorCode: PLUGIN_RESOURCE_ERROR_CODE.NO_MATCHING_COMPONENTS }
      })
    ).toEqual({
      key: 'XP.Xpert.TemplatePluginSkillsNoMatchingComponents',
      defaultMessage:
        'The plugin components required by this template were not found. Verify that the required plugins are installed and try again.'
    })
  })

  it('does not infer localization from an unknown error message', () => {
    expect(resolveTemplatePluginSkillInstallError(new Error('No matching plugin components were found'))).toBeNull()
  })

  it.each(['en', 'en-US', 'zh-Hans', 'zh-CN', 'zh-Hant'])('defines template skill errors in %s', (locale) => {
    const catalog = readFileSync(join(__dirname, '../../../../../assets/i18n', `${locale}.json`), 'utf8')

    expect(catalog).toContain('"TemplatePluginSkillsInstallFailed"')
    expect(catalog).toContain('"TemplatePluginSkillsNoMatchingComponents"')
    expect(catalog).toContain('"TemplatePluginSkillsMissingRuntimePackages"')
    expect(catalog).toContain('"TemplatePluginSkillsInstallFailedDetail"')
  })
})
