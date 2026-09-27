import logo from '../resources/logo.svg'

export function XpertLogo({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{ mask: `url("${logo}") center / contain no-repeat` }}
    />
  )
}
