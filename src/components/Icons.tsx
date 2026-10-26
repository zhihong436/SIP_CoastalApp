import type { ReactNode } from 'react'

// Strokes use the current text colour. Icon-only buttons carry their own accessible label.
function Icon({
  size,
  filled,
  strokeWidth = 2,
  children,
}: {
  size: number
  filled?: boolean
  strokeWidth?: number
  children: ReactNode
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export const DiscoverIcon = ({ size = 26 }: { size?: number }) => (
  <Icon size={size}>
    <rect x="7" y="3" width="12" height="16" rx="3" />
    <path d="M4 7v11a3 3 0 0 0 3 3h8" />
  </Icon>
)

export const ChatsIcon = ({ size = 26 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M20.5 11.5a8 8 0 0 1-11.7 7.1L4 20l1.4-4.5A8 8 0 1 1 20.5 11.5z" />
  </Icon>
)

export const MeIcon = ({ size = 26 }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20.5c1.5-3.6 4.5-5.5 8-5.5s6.5 1.9 8 5.5" />
  </Icon>
)

export const CrossIcon = ({ size = 26 }: { size?: number }) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.6}
    strokeLinecap="round"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const HeartIcon = ({ size = 32 }: { size?: number }) => (
  <Icon size={size} filled>
    <path d="M12 20.5s-7.6-4.6-9.5-9.4C1.2 7.8 3.3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.4 0 5.5 3.3 4.2 6.6-1.9 4.8-9.5 9.4-9.5 9.4z" />
  </Icon>
)

export const BackIcon = ({ size = 26 }: { size?: number }) => (
  <Icon size={size} strokeWidth={2.4}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
)

export const ChevronIcon = ({ size = 22 }: { size?: number }) => (
  <Icon size={size} strokeWidth={2.4}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
)

export const WaveIcon = ({ size = 24 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M2 10c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3" />
    <path d="M2 16c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3" />
  </Icon>
)

export const SendIcon = ({ size = 22 }: { size?: number }) => (
  <Icon size={size} strokeWidth={2.6}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
)

export const PencilIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size} strokeWidth={2.2}>
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
  </Icon>
)

export const AlertIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size} strokeWidth={2.4}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v0.5" />
  </Icon>
)
