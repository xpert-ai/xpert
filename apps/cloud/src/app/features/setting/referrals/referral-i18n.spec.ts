import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const referralTranslationKeys = [
  'CopyCode',
  'Copied',
  'RegenerateCode',
  'RegeneratingCode',
  'RegenerateConfirmTitle',
  'RegenerateConfirmDescription',
  'RegenerateSuccess',
  'RegenerateFailed',
  'ReferralCode',
  'ReferralCodePlaceholder',
  'ValidatingReferralCode',
  'InvalidReferralCode',
  'ValidReferralCode',
  'Relationships',
  'RelationshipsDescription',
  'SearchPlaceholder',
  'Referrer',
  'Referred',
  'UsedCode',
  'BoundAt',
  'DeletedAccount',
  'Empty',
  'LoadError',
  'Previous',
  'Next',
  'PageSummary'
]

describe('referral translations', () => {
  it.each(['en', 'en-US', 'zh-CN', 'zh-Hans', 'zh-Hant'])(
    'provides every referral message in the XP namespace for %s',
    (locale) => {
      const messages = JSON.parse(readFileSync(join(__dirname, '../../../../assets/i18n', `${locale}.json`), 'utf8'))

      referralTranslationKeys.forEach((key) => {
        expect(messages.XP?.Referral?.[key]).toEqual(expect.any(String))
      })
    }
  )

  it('uses the Chinese copy action instead of the English fallback', () => {
    const messages = JSON.parse(readFileSync(join(__dirname, '../../../../assets/i18n', 'zh-Hans.json'), 'utf8'))

    expect(messages.XP.Referral.CopyCode).toBe('复制邀请码')
  })
})
