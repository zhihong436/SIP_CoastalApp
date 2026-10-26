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

export function Avatar({ name, className }: { name: string; className: string }) {
  const { initials, gradient } = avatarOf(name)
  return (
    <span className={className} style={{ background: gradient }} aria-hidden="true">
      {initials}
    </span>
  )
}
