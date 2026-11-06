// Print-card helper. The QR encoder is the existing `qr` dependency; no extra QR package is needed.
import encodeQR from 'qr'
import './card.css'

const form = byId<HTMLFormElement>('card-form')
const urlInput = byId<HTMLInputElement>('card-url')
const resetButton = byId<HTMLButtonElement>('reset-url')
const printButton = byId<HTMLButtonElement>('print-button')
const warning = byId<HTMLElement>('url-warning')
const error = byId<HTMLElement>('url-error')
const preview = byId<HTMLElement>('qr-code')
const smallQr = byId<HTMLElement>('card-qr-small')
const previewUrl = byId<HTMLElement>('card-url-text')
const cardUrl = byId<HTMLElement>('card-qr-url')
const cardQrNote = byId<HTMLElement>('card-qr-note')

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing #${id}`)
  return element as T
}

function defaultExperimentUrl() {
  return new URL('ar.html', window.location.href).href
}

function parseExperimentUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

function warningFor(url: URL) {
  const host = url.hostname.toLowerCase()
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
  const isPrivate =
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    /^169\.254\./.test(host)

  if (isLocalhost) {
    return 'This QR points to localhost, which a phone cannot open. Enter the HTTPS preview URL or the trusted local HTTPS address before printing a phone card.'
  }
  if (url.protocol === 'http:') {
    return 'Safari will not allow camera access over plain HTTP. Use an HTTPS URL for a phone test.'
  }
  if (isPrivate) {
    return 'This is a private network URL. It will only work if the phone is on the same network and trusts the HTTPS certificate. Check it on the phone before printing.'
  }
  return ''
}

function renderQr(url: string) {
  const svg = encodeQR(url, 'svg', { ecc: 'high', border: 4, optimize: true })
  preview.innerHTML = svg
  smallQr.innerHTML = svg
  previewUrl.textContent = url
  cardUrl.textContent = url
}

function updateFromInput(rewriteInput = true) {
  const raw = urlInput.value
  const normalized = parseExperimentUrl(raw)
  error.hidden = true
  if (!normalized) {
    printButton.disabled = true
    warning.hidden = false
    warning.textContent = 'Enter a full http:// or https:// URL. A relative address cannot be printed into a phone card.'
    preview.innerHTML = ''
    smallQr.innerHTML = ''
    previewUrl.textContent = 'Not set'
    cardUrl.textContent = ''
    return
  }

  if (rewriteInput) urlInput.value = normalized
  warning.hidden = true
  try {
    renderQr(normalized)
  } catch {
    printButton.disabled = true
    error.hidden = false
    error.textContent = 'That URL is too long for the QR encoder. Use a shorter experiment address.'
    return
  }

  printButton.disabled = false
  const parsed = new URL(normalized)
  const note = warningFor(parsed)
  warning.hidden = note === ''
  warning.textContent = note

  // If a local/dead URL is printed anyway, the card itself carries the warning next to the QR.
  const host = parsed.hostname.toLowerCase()
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
  if (local) {
    cardQrNote.hidden = false
    cardQrNote.textContent = 'LOCALHOST — A PHONE CANNOT OPEN THIS. REPLACE THE QR BEFORE PRINTING.'
  } else if (parsed.protocol === 'http:') {
    cardQrNote.hidden = false
    cardQrNote.textContent = 'HTTP — SAFARI BLOCKS THE CAMERA. USE HTTPS.'
  } else {
    cardQrNote.hidden = true
    cardQrNote.textContent = ''
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  updateFromInput()
})

urlInput.addEventListener('input', () => updateFromInput(false))
urlInput.addEventListener('change', () => updateFromInput())

resetButton.addEventListener('click', () => {
  urlInput.value = defaultExperimentUrl()
  updateFromInput()
})

printButton.addEventListener('click', () => {
  // Re-render from the current field in case the user typed without pressing Update QR.
  updateFromInput()
  if (!printButton.disabled) window.print()
})

// Start with the URL of this page's ar.html. This is honest local state: if it is localhost,
// the warning tells the user that a phone cannot use it.
urlInput.value = defaultExperimentUrl()
updateFromInput()
