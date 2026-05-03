interface Props {
  /** 'mark' = icon only, 'full' = icon + wordmark */
  variant?: 'mark' | 'full'
  size?: number
}

export default function Logo({ variant = 'full', size = 32 }: Props) {
  if (variant === 'mark') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Shillak"
      >
        <rect width="40" height="40" rx="9" fill="#1a1a1a" />
        <rect x="0.5" y="0.5" width="39" height="39" rx="8.5" stroke="#2e2e2e" strokeWidth="0.5" />
        <path
          d="M 26,13 C 26,7 14,7 14,13 C 14,19 26,21 26,27 C 26,33 14,33 14,27"
          stroke="#f59e0b"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  const h = size
  const w = Math.round(size * 4)

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 160 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Shillak"
    >
      <rect width="40" height="40" rx="9" fill="#1a1a1a" />
      <rect x="0.5" y="0.5" width="39" height="39" rx="8.5" stroke="#2e2e2e" strokeWidth="0.5" />
      <path
        d="M 26,13 C 26,7 14,7 14,13 C 14,19 26,21 26,27 C 26,33 14,33 14,27"
        stroke="#f59e0b"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="52"
        y="26"
        fontFamily="Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="19"
        fontWeight="600"
        letterSpacing="-0.5"
        fill="#f0f0f0"
      >
        Shillak
      </text>
    </svg>
  )
}
