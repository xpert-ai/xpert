import { useEffect, useRef } from 'react'
import { followAvatarPointer } from './motion'

export function AnimatedAssistantAvatar() {
  const face = useRef<SVGSVGElement>(null)
  const left = useRef<SVGGElement>(null)
  const right = useRef<SVGGElement>(null)
  const mouth = useRef<SVGGElement>(null)
  useEffect(() => {
    if (face.current && left.current && right.current && mouth.current) {
      return followAvatarPointer(face.current, left.current, right.current, mouth.current)
    }
  }, [])

  return (
    <svg
      ref={face}
      viewBox="0 0 100 100"
      className="pointer-events-none size-full"
      aria-hidden="true"
      focusable="false"
      data-assistant-mascot=""
    >
      {/* Independent vector layers reproduce the smile tile used by resources/icon-macos.svg. */}
      <g fill="none" className="stroke-current" strokeLinecap="round" strokeLinejoin="round">
        <g ref={left} data-face-part="left-eye">
          <path d="M23 31 L39 46 L23 60" strokeWidth="7.5" />
        </g>
        <g ref={right} data-face-part="right-eye">
          <path d="M78 35 L64 46 L78 59" strokeWidth="3.3" />
        </g>
        <g ref={mouth} data-face-part="mouth">
          <path d="M39 70 Q50 78 61 70" strokeWidth="4.4" />
        </g>
      </g>
    </svg>
  )
}
