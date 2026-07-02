import type { SVGProps } from 'react'

// Iconos SVG inline (trazo, estilo outline) para no añadir dependencias.
type IconProps = SVGProps<SVGSVGElement>

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export function HomeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9.25V19a1 1 0 0 0 1 1H10v-5h4v5h3.5a1 1 0 0 0 1-1V9.25" />
    </Base>
  )
}

export function ArrowsRightLeftIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h16m0 0-3.5-3.5M20 7l-3.5 3.5" />
      <path d="M20 17H4m0 0 3.5-3.5M4 17l3.5 3.5" />
    </Base>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 3v3m8-3v3M4.5 9.5h15" />
      <path d="M6.5 5h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
    </Base>
  )
}

export function ChartBarIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 20h16" />
      <path d="M7 20v-5m5 5V9m5 11v-8" />
    </Base>
  )
}

export function EllipsisIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </Base>
  )
}

export function RepeatIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m17 2.5 3 3-3 3" />
      <path d="M20 5.5H8A4.5 4.5 0 0 0 3.5 10v.5" />
      <path d="m7 21.5-3-3 3-3" />
      <path d="M4 18.5h12a4.5 4.5 0 0 0 4.5-4.5v-.5" />
    </Base>
  )
}

export function TargetIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </Base>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 4v6m0 4v6M12 4v2m0 4v10M18 4v10m0 4v2" />
      <circle cx="6" cy="12" r="2" />
      <circle cx="12" cy="8" r="2" />
      <circle cx="18" cy="16" r="2" />
    </Base>
  )
}

export function LogoutIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M13 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" />
      <path d="M10 12h10m0 0-3-3m3 3-3 3" />
    </Base>
  )
}

export function LockIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="5.5" y="10.5" width="13" height="9" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" />
    </Base>
  )
}
