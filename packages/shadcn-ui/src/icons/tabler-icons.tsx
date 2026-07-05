import * as React from 'react'

type TablerIconProps = React.SVGProps<SVGSVGElement> & {
  size?: string | number
}

// SVG paths are sourced from Tabler Icons v3.44.0 (MIT).
export const TablerFolderOpenFilledIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M2 6c0-.796.316-1.558.879-2.121A3 3 0 0 1 5 3h4l.099.005c.229.023.444.124.608.288L12.414 6H19c.796 0 1.558.316 2.121.879.319.319.559.703.707 1.121H7.305c-.407 0-.805.125-1.14.356-.292.203-.525.48-.674.801l-.058.141-1.379 3.676a1 1 0 0 0 1.873.702l1.134-3.027A1 1 0 0 1 7.998 10H21l.217.012c.216.024.426.082.624.173.054.025.107.053.159.083.199.115.377.263.525.439.188.222.325.482.403.762.077.28.092.573.045.859l-.005.024-.995 5.21a3 3 0 0 1-1.036 1.749c-.47.389-1.046.624-1.65.677l-.261.012H5a3 3 0 0 1-3-3V6z" />
    </svg>
  )
)
TablerFolderOpenFilledIcon.displayName = 'TablerFolderOpenFilledIcon'

export const TablerFoldersIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M9 3h3l2 2h5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2" />
      <path d="M17 16v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2" />
    </svg>
  )
)
TablerFoldersIcon.displayName = 'TablerFoldersIcon'

export const TablerFileTypeDocxIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12V5a2 2 0 0 1 2-2h7l5 5v4" />
      <path d="M2 15v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H2" />
      <path d="M17 16.5a1.5 1.5 0 0 0-3 0v3a1.5 1.5 0 0 0 3 0" />
      <path d="M9.5 15a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-3 0v-3A1.5 1.5 0 0 1 9.5 15" />
      <path d="m19.5 15 3 6" />
      <path d="m19.5 21 3-6" />
    </svg>
  )
)
TablerFileTypeDocxIcon.displayName = 'TablerFileTypeDocxIcon'

export const TablerFileTypePdfIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12V5a2 2 0 0 1 2-2h7l5 5v4" />
      <path d="M5 18h1.5a1.5 1.5 0 0 0 0-3H5v6" />
      <path d="M17 18h2" />
      <path d="M20 15h-3v6" />
      <path d="M11 15v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-1" />
    </svg>
  )
)
TablerFileTypePdfIcon.displayName = 'TablerFileTypePdfIcon'

export const TablerFileTypeXlsIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2-2h7l5 5v4" />
      <path d="M4 15l4 6" />
      <path d="M4 21l4-6" />
      <path d="M17 20.25c0 .414.336.75.75.75H19a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1h-1a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1.25a.75.75 0 0 1 .75.75" />
      <path d="M11 15v6h3" />
    </svg>
  )
)
TablerFileTypeXlsIcon.displayName = 'TablerFileTypeXlsIcon'

export const TablerFileTypeCsvIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2-2h7l5 5v4" />
      <path d="M7 16.5a1.5 1.5 0 0 0-3 0v3a1.5 1.5 0 0 0 3 0" />
      <path d="M10 20.25c0 .414.336.75.75.75H12a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1h-1a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1.25a.75.75 0 0 1 .75.75" />
      <path d="M16 15l2 6l2-6" />
    </svg>
  )
)
TablerFileTypeCsvIcon.displayName = 'TablerFileTypeCsvIcon'

export const TablerFileTypeHtmlIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2-2h7l5 5v4" />
      <path d="M2 21v-6" />
      <path d="M5 15v6" />
      <path d="M2 18h3" />
      <path d="M20 15v6h2" />
      <path d="M13 21v-6l2 3l2-3v6" />
      <path d="M7.5 15h3" />
      <path d="M9 15v6" />
    </svg>
  )
)
TablerFileTypeHtmlIcon.displayName = 'TablerFileTypeHtmlIcon'

export const TablerFileTypeJpgIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2-2h7l5 5v4" />
      <path d="M11 18h1.5a1.5 1.5 0 0 0 0-3H11v6" />
      <path d="M20 15h-1a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-3" />
      <path d="M5 15h3v4.5a1.5 1.5 0 0 1-3 0" />
    </svg>
  )
)
TablerFileTypeJpgIcon.displayName = 'TablerFileTypeJpgIcon'

export const TablerFileTypePngIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2-2h7l5 5v4" />
      <path d="M20 15h-1a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-3" />
      <path d="M5 18h1.5a1.5 1.5 0 0 0 0-3H5v6" />
      <path d="M11 21v-6l3 6v-6" />
    </svg>
  )
)
TablerFileTypePngIcon.displayName = 'TablerFileTypePngIcon'

export const TablerFileTypePptIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 18h1.5a1.5 1.5 0 0 0 0-3H5v6" />
      <path d="M11 18h1.5a1.5 1.5 0 0 0 0-3H11v6" />
      <path d="M16.5 15h3" />
      <path d="M18 15v6" />
      <path d="M5 12v-7a2 2 0 0 1 2-2h7l5 5v4" />
    </svg>
  )
)
TablerFileTypePptIcon.displayName = 'TablerFileTypePptIcon'

export const TablerFileTypeSvgIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2-2h7l5 5v4" />
      <path d="M4 20.25c0 .414.336.75.75.75H6a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1H5a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1.25a.75.75 0 0 1 .75.75" />
      <path d="M10 15l2 6l2-6" />
      <path d="M20 15h-1a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-3" />
    </svg>
  )
)
TablerFileTypeSvgIcon.displayName = 'TablerFileTypeSvgIcon'

export const TablerFileTypeTxtIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M16.5 15h3" />
      <path d="M5 12v-7a2 2 0 0 1 2-2h7l5 5v4" />
      <path d="M4.5 15h3" />
      <path d="M6 15v6" />
      <path d="M18 15v6" />
      <path d="M10 15l4 6" />
      <path d="M10 21l4-6" />
    </svg>
  )
)
TablerFileTypeTxtIcon.displayName = 'TablerFileTypeTxtIcon'

export const TablerFileTypeZipIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2-2h7l5 5v4" />
      <path d="M16 18h1.5a1.5 1.5 0 0 0 0-3H16v6" />
      <path d="M12 15v6" />
      <path d="M5 15h3l-3 6h3" />
    </svg>
  )
)
TablerFileTypeZipIcon.displayName = 'TablerFileTypeZipIcon'

export const TablerFileDescriptionIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2" />
      <path d="M9 17h6" />
      <path d="M9 13h6" />
    </svg>
  )
)
TablerFileDescriptionIcon.displayName = 'TablerFileDescriptionIcon'

export const TablerFileCodeIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2" />
      <path d="M10 13l-1 2l1 2" />
      <path d="M14 13l1 2l-1 2" />
    </svg>
  )
)
TablerFileCodeIcon.displayName = 'TablerFileCodeIcon'

export const TablerFileMusicIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2" />
      <path d="M10 16a1 1 0 1 0 2 0a1 1 0 1 0-2 0" />
      <path d="M12 16v-5l2 1" />
    </svg>
  )
)
TablerFileMusicIcon.displayName = 'TablerFileMusicIcon'

export const TablerFileIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2" />
    </svg>
  )
)
TablerFileIcon.displayName = 'TablerFileIcon'

export const TablerVideoIcon = React.forwardRef<SVGSVGElement, TablerIconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      <path d="M15 10l4.553-2.276a1 1 0 0 1 1.447.894v6.764a1 1 0 0 1-1.447.894L15 14v-4" />
      <path d="M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" />
    </svg>
  )
)
TablerVideoIcon.displayName = 'TablerVideoIcon'
