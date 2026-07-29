const REFERRAL_SESSION_KEY = 'xpert.registration.referral-code'

export function saveRegistrationReferralCode(code?: string | null) {
  const normalized = code?.trim().toUpperCase()
  if (typeof sessionStorage === 'undefined') {
    return
  }
  if (!normalized) {
    sessionStorage.removeItem(REFERRAL_SESSION_KEY)
    return
  }
  sessionStorage.setItem(REFERRAL_SESSION_KEY, normalized)
}

export function getRegistrationReferralCode() {
  if (typeof sessionStorage === 'undefined') {
    return ''
  }
  return sessionStorage.getItem(REFERRAL_SESSION_KEY)?.trim().toUpperCase() ?? ''
}

export function clearRegistrationReferralCode() {
  if (typeof sessionStorage === 'undefined') {
    return
  }
  sessionStorage.removeItem(REFERRAL_SESSION_KEY)
}
