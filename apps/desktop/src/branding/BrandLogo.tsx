import logo from '../../resources/icon-macos.png'

export function BrandLogo({ className = '' }: { className?: string }) {
  return <img src={logo} alt="" aria-hidden="true" className={`shrink-0 object-contain ${className}`} />
}
