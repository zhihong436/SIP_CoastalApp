export function PreviewBanner({ children }: { children: string }) {
  return (
    <p className="preview-banner" role="note">
      <strong>Preview only.</strong> {children}
    </p>
  )
}
