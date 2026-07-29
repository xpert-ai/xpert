export enum PasswordStrengthEnum {
  Tooweak = 'Tooweak',
  Weak = 'Weak',
  Medium = 'Medium',
  Strong = 'Strong'
}

const PasswordStrengthOptions = [
  {
    id: 0,
    value: PasswordStrengthEnum.Tooweak,
    minDiversity: 0,
    minLength: 0
  },
  {
    id: 1,
    value: PasswordStrengthEnum.Weak,
    minDiversity: 2,
    minLength: 6
  },
  {
    id: 2,
    value: PasswordStrengthEnum.Medium,
    minDiversity: 4,
    minLength: 8
  },
  {
    id: 3,
    value: PasswordStrengthEnum.Strong,
    minDiversity: 4,
    minLength: 10
  }
]

const passwordStrength = (
  password,
  options = PasswordStrengthOptions,
  allowedSymbols = '!"#$%&\'()*+,-./:;<=>?@[\\\\\\]^_`{|}~'
) => {
  const passwordCopy = password || ''

  ;((options[0].minDiversity = 0), (options[0].minLength = 0))

  const rules = [
    {
      regex: '[a-z]',
      message: 'lowercase'
    },
    {
      regex: '[A-Z]',
      message: 'uppercase'
    },
    {
      regex: '[0-9]',
      message: 'number'
    }
  ]

  if (allowedSymbols) {
    rules.push({
      regex: `[${allowedSymbols}]`,
      message: 'symbol'
    })
  }

  const strength = { contains: null, length: null, value: null }

  strength.contains = rules.filter((rule) => new RegExp(`${rule.regex}`).test(passwordCopy)).map((rule) => rule.message)

  strength.length = passwordCopy.length

  const fulfilledOptions = options
    .filter((option) => strength.contains.length >= option.minDiversity)
    .filter((option) => strength.length >= option.minLength)
    .sort((o1, o2) => o2.id - o1.id)
    .map((option) => ({ id: option.id, value: option.value }))

  Object.assign(strength, fulfilledOptions[0])

  return strength
}

export { PasswordStrengthOptions, passwordStrength }
