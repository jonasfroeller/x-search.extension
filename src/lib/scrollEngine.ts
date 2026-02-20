type ScrollCallback = (tweetsInView: number) => void
type StatusCallback = (status: "scrolling" | "paused" | "stopped" | "complete") => void

interface ScrollEngineConfig {
  minDelay: number
  maxDelay: number
  scrollDistance: number
}

const DEFAULT_CONFIG: ScrollEngineConfig = {
  minDelay: 1500,
  maxDelay: 3000,
  scrollDistance: 800
}

let isRunning = false
let isPaused = false
let abortController: AbortController | null = null
let onTweetsInView: ScrollCallback | null = null
let onStatusChange: StatusCallback | null = null
let config = { ...DEFAULT_CONFIG }

function randomDelay(): number {
  return config.minDelay + Math.random() * (config.maxDelay - config.minDelay)
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    })
  })
}

function countVisibleTweets(): number {
  return document.querySelectorAll('[data-testid="tweet"]').length
}

function isEndOfTimeline(): boolean {
  const containers = document.querySelectorAll('[data-testid="emptyState"]')
  if (containers.length > 0) return true

  const retryButton = document.querySelector('[data-testid="retry"]')
  if (retryButton) return true

  return false
}

async function scrollLoop(signal: AbortSignal) {
  onStatusChange?.("scrolling")
  let stallCount = 0
  const maxStalls = 8

  while (isRunning && !signal.aborted) {
    if (isPaused) {
      onStatusChange?.("paused")
      await sleep(500, signal)
      continue
    }

    const prevScrollY = window.scrollY

    window.scrollBy({ top: config.scrollDistance, behavior: "smooth" })
    await sleep(randomDelay(), signal)

    onTweetsInView?.(countVisibleTweets())

    const newScrollY = window.scrollY

    if (newScrollY > prevScrollY) {
      stallCount = 0
      continue
    }

    // scrollY didn't change => we might be at the true bottom
    stallCount++

    if (isEndOfTimeline() && stallCount >= 3) {
      onStatusChange?.("complete")
      isRunning = false
      return
    }

    if (stallCount >= maxStalls) {
      onStatusChange?.("complete")
      isRunning = false
      return
    }

    // nudge + wait longer for X to load more content
    window.scrollBy({ top: -200, behavior: "smooth" })
    await sleep(1000, signal)
    window.scrollBy({ top: 400, behavior: "smooth" })
    await sleep(2000 + stallCount * 1500, signal)
  }
}

export function startScrolling(
  tweetsCallback: ScrollCallback,
  statusCallback: StatusCallback,
  customConfig?: Partial<ScrollEngineConfig>
) {
  if (isRunning) return

  if (customConfig) config = { ...DEFAULT_CONFIG, ...customConfig }
  onTweetsInView = tweetsCallback
  onStatusChange = statusCallback
  isRunning = true
  isPaused = false
  abortController = new AbortController()

  scrollLoop(abortController.signal).catch(err => {
    if (err.name !== "AbortError") console.error("[x-search] scroll error:", err)
  })
}

export function pauseScrolling() {
  isPaused = true
}

export function resumeScrolling() {
  if (!isRunning) return
  isPaused = false
  onStatusChange?.("scrolling")
}

export function stopScrolling() {
  isRunning = false
  isPaused = false
  abortController?.abort()
  abortController = null
  onStatusChange?.("stopped")
}

export function isScrolling(): boolean {
  return isRunning && !isPaused
}
