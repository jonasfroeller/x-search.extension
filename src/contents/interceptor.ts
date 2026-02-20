import type { PlasmoCSConfig } from "plasmo"
import type { Tweet } from "~lib/db"
import { parseTweetFromDom } from "~lib/tweetParser"
import { getProfileHandle } from "~lib/profileDetector"
import { startScrolling, pauseScrolling, resumeScrolling, stopScrolling } from "~lib/scrollEngine"

export const config: PlasmoCSConfig = {
  matches: ["https://x.com/*", "https://twitter.com/*"],
  run_at: "document_idle"
}

const processedTweetIds = new Set<string>()
let currentHandle: string | null = null
let indexedCount = 0
let scanTimer: ReturnType<typeof setTimeout> | null = null
let cachedAvatarUrl = ""
let cachedDisplayName = ""

function init() {
  observeDom()
  listenForMessages()
  detectProfile()

  const observer = new MutationObserver(detectProfile)
  observer.observe(document.querySelector("head > title") ?? document.head, {
    childList: true,
    subtree: true,
    characterData: true
  })
}

function detectProfile() {
  const handle = getProfileHandle()
  if (handle !== currentHandle) {
    currentHandle = handle
    processedTweetIds.clear()
    indexedCount = 0
    cachedAvatarUrl = ""
    cachedDisplayName = ""
    broadcastState()

    if (handle) {
      setTimeout(() => {
        extractProfileInfo()
        if (cachedAvatarUrl || cachedDisplayName) {
          chrome.runtime.sendMessage({
            type: "update-profile-info",
            handle,
            displayName: cachedDisplayName || undefined,
            avatarUrl: cachedAvatarUrl || undefined
          }).catch(() => { })
        }
      }, 2000)
    }
  }
}

function extractProfileInfo() {
  if (cachedAvatarUrl && cachedDisplayName) return

  const avatarImg = document.querySelector<HTMLImageElement>(
    `[data-testid="UserAvatar-Container-${currentHandle}"] img[src*="profile_images"]`
  )
  if (avatarImg?.src) {
    cachedAvatarUrl = avatarImg.src.replace(/_\d+x\d+\./, "_400x400.")
  }

  const nameEl = document.querySelector('[data-testid="UserName"]')
  if (nameEl) {
    const span = nameEl.querySelector('span > span')
    if (span?.textContent) cachedDisplayName = span.textContent.trim()
  }
}

function observeDom() {
  const observer = new MutationObserver(() => {
    if (!currentHandle) return
    debouncedScan()
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

function debouncedScan() {
  if (scanTimer) return
  scanTimer = setTimeout(() => {
    scanTimer = null
    scanVisibleTweets()
  }, 500)
}

function scanVisibleTweets() {
  if (!currentHandle) return

  const articles = document.querySelectorAll('[data-testid="tweet"]')
  const tweets: Tweet[] = []

  for (const el of articles) {
    const tweet = parseTweetFromDom(el, currentHandle)
    if (tweet && !processedTweetIds.has(tweet.id)) {
      processedTweetIds.add(tweet.id)
      tweets.push(tweet)
    }
  }

  if (tweets.length > 0) storeBatch(tweets)
}

async function storeBatch(tweets: Tweet[]) {
  extractProfileInfo()

  const response = await chrome.runtime.sendMessage({
    type: "store-tweets",
    tweets,
    handle: currentHandle,
    displayName: cachedDisplayName || undefined,
    avatarUrl: cachedAvatarUrl || undefined
  })

  if (response?.indexedCount !== undefined) {
    indexedCount = response.indexedCount
  }

  broadcastState()
}

function broadcastState() {
  chrome.runtime.sendMessage({
    type: "state-update",
    data: {
      handle: currentHandle,
      indexedCount,
      processedCount: processedTweetIds.size,
    }
  }).catch(() => { })
}

function listenForMessages() {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "command") {
      switch (msg.command) {
        case "start":
          if (!currentHandle) return
          chrome.runtime.sendMessage({ type: "set-sync-status", handle: currentHandle, status: "indexing" })
          startScrolling(
            () => scanVisibleTweets(),
            async (status) => {
              if (status === "complete" && currentHandle) {
                chrome.runtime.sendMessage({ type: "set-sync-status", handle: currentHandle, status: "complete" })
              }
              broadcastState()
            }
          )
          sendResponse({ ok: true })
          break
        case "pause":
          pauseScrolling()
          if (currentHandle) chrome.runtime.sendMessage({ type: "set-sync-status", handle: currentHandle, status: "paused" })
          sendResponse({ ok: true })
          break
        case "resume":
          resumeScrolling()
          if (currentHandle) chrome.runtime.sendMessage({ type: "set-sync-status", handle: currentHandle, status: "indexing" })
          sendResponse({ ok: true })
          break
        case "stop":
          stopScrolling()
          if (currentHandle) chrome.runtime.sendMessage({ type: "set-sync-status", handle: currentHandle, status: "idle" })
          sendResponse({ ok: true })
          break
        case "get-state":
          sendResponse({ handle: currentHandle, indexedCount })
          break
      }
    }
    return true
  })
}

init()
