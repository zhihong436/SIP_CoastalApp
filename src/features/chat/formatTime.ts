const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

export function formatTime(iso: string) {
  return timeFormat.format(new Date(iso))
}

// Today shows the time and earlier days show the date.
export function formatTimeOrDate(iso: string) {
  const date = new Date(iso)
  return date.toDateString() === new Date().toDateString() ? timeFormat.format(date) : dateFormat.format(date)
}
