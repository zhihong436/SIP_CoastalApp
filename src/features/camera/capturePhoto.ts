// Draws onto a canvas whose pixels are scaled so the drawing code can work in screen (CSS) pixels.
export type DrawOnView = (context: CanvasRenderingContext2D, width: number, height: number) => void

// Takes a still of what the video element shows on screen. The video fills its box with object-fit: cover,
// so the screen shows only a cropped part of the camera picture. This copies that same part, then lets
// draw add graphics at the positions they had on screen. The result stays in memory and is never uploaded.
export function capturePhoto(video: HTMLVideoElement, draw: DrawOnView): Promise<Blob | null> {
  const viewWidth = video.clientWidth
  const viewHeight = video.clientHeight
  if (!video.videoWidth || !viewWidth || !viewHeight) return Promise.resolve(null)

  // Camera pixels per screen pixel. Cover scales up until both sides are filled.
  const scale = Math.max(viewWidth / video.videoWidth, viewHeight / video.videoHeight)
  const cropWidth = viewWidth / scale
  const cropHeight = viewHeight / scale
  const cropLeft = (video.videoWidth - cropWidth) / 2
  const cropTop = (video.videoHeight - cropHeight) / 2

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(cropWidth)
  canvas.height = Math.round(cropHeight)
  const context = canvas.getContext('2d')!
  context.drawImage(video, cropLeft, cropTop, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height)
  context.save()
  context.scale(canvas.width / viewWidth, canvas.height / viewHeight)
  draw(context, viewWidth, viewHeight)
  context.restore()

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
}

// Offers the photo to the iPhone share sheet, where Save Image is available, and otherwise downloads it.
// Returns false only when something went wrong. Closing the share sheet is not a failure.
export async function savePhoto(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return true
    } catch (error) {
      return error instanceof DOMException && error.name === 'AbortError'
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return true
}
