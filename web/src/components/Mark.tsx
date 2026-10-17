/** The QUOTIENT mark. A hexagon with a core, because of course it is. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-accent-wash" />
      <path
        d="M16 6.5 25 11.5v9L16 25.5 7 20.5v-9L16 6.5Z"
        fill="none"
        className="stroke-accent"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="3.1" className="fill-accent" />
    </svg>
  )
}
