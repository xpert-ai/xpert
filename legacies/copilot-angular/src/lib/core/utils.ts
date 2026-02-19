export function getOperatingSystem() {
  const userAgent = navigator.userAgent || navigator.vendor

  // Windows
  if (/windows phone/i.test(userAgent)) {
    return 'Windows'
  }
  if (/win/i.test(userAgent)) {
    return 'Windows'
  }

  // iOS
  if (/iPad|iPhone|iPod/.test(userAgent)) {
    return 'iOS'
  }

  // macOS
  if (/Mac/i.test(userAgent)) {
    return 'macOS'
  }

  return 'unknown'
}

export function getCtrlCharacter(os: string) {
  if (os === 'iOS' || os === 'macOS') {
    return '⌘'
  } else if (os === 'Windows') {
    return 'Ctrl'
  }
  return ''
}
