import { getRegistrationReferralCode, saveRegistrationReferralCode } from './referral-registration-session'

describe('registration referral session', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('clears a previously saved code when the current value is empty', () => {
    saveRegistrationReferralCode('ABC234DEFG')

    saveRegistrationReferralCode('')

    expect(getRegistrationReferralCode()).toBe('')
  })
})
