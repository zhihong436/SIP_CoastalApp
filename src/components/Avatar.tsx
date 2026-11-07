// Profiles have no photos, so a name becomes initials on one of four coral gradients.
export function avatarOf(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? '')
    .join('')
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return { initials, gradient: `var(--avatar-gradient-${hash % 4})` }
}

export function Avatar({
  name,
  className,
  background,
}: {
  name: string
  className: string
  // Optional presentation override. The name's coral gradient remains the default.
  background?: string
}) {
  const { initials, gradient } = avatarOf(name)
  return (
    <span className={className} style={{ background: background ?? gradient }} aria-hidden="true">
      {initials}
    </span>
  )
}
