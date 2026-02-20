import { storeTweets, updateProfileStats, setProfileSyncStatus, getIndexedCount, deleteProfileData, getStorageStats } from "~background/index"
import { searchTweets, getAllProfiles } from "~lib/searchEngine"

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch(err => {
    console.error("[x-search] background error:", err)
    sendResponse({ error: err.message })
  })
  return true
})

async function handleMessage(msg: Record<string, unknown>) {
  switch (msg.type) {
    case "store-tweets": {
      const newCount = await storeTweets(msg.tweets as Parameters<typeof storeTweets>[0])
      if (msg.handle) {
        await updateProfileStats(
          msg.handle as string,
          msg.displayName as string | undefined,
          msg.avatarUrl as string | undefined
        )
      }
      const indexedCount = await getIndexedCount(msg.handle as string)
      return { newCount, indexedCount }
    }
    case "set-sync-status":
      await setProfileSyncStatus(msg.handle as string, msg.status as Parameters<typeof setProfileSyncStatus>[1])
      return { ok: true }
    case "get-indexed-count":
      return { count: await getIndexedCount(msg.handle as string) }
    case "search":
      return { results: await searchTweets(msg.options as Parameters<typeof searchTweets>[0]) }
    case "get-profiles":
      return { profiles: await getAllProfiles() }
    case "get-stats":
      return { stats: await getStorageStats() }
    case "delete-profile":
      await deleteProfileData(msg.handle as string)
      return { ok: true }
    case "update-profile-info":
      await updateProfileStats(
        msg.handle as string,
        msg.displayName as string | undefined,
        msg.avatarUrl as string | undefined
      )
      return { ok: true }
    default:
      return null
  }
}
