import { db, type Tweet, type Profile } from "~lib/db"

export async function storeTweets(tweets: Tweet[]): Promise<number> {
  if (tweets.length === 0) return 0

  const existingIds = new Set(
    (await db.tweets.where("id").anyOf(tweets.map(t => t.id)).primaryKeys())
  )

  const newTweets = tweets.filter(t => !existingIds.has(t.id))
  if (newTweets.length === 0) return 0

  await db.tweets.bulkPut(newTweets)
  return newTweets.length
}

export async function updateProfileStats(handle: string, displayName?: string, avatarUrl?: string) {
  const tweets = await db.tweets
    .where("profileHandle")
    .equals(handle)
    .sortBy("timestamp")

  const totalIndexed = tweets.length
  if (totalIndexed === 0) return

  const existing = await db.profiles.get(handle)

  const profile: Profile = {
    handle,
    displayName: displayName ?? existing?.displayName ?? handle,
    avatarUrl: avatarUrl ?? existing?.avatarUrl ?? "",
    totalIndexed,
    oldestTimestamp: tweets[0].timestamp,
    newestTimestamp: tweets[tweets.length - 1].timestamp,
    lastSyncAt: Date.now(),
    syncStatus: existing?.syncStatus ?? "idle"
  }

  await db.profiles.put(profile)
}

export async function setProfileSyncStatus(handle: string, status: Profile["syncStatus"]) {
  await db.profiles.update(handle, { syncStatus: status })
}

export async function hasExistingTweet(tweetId: string): Promise<boolean> {
  return (await db.tweets.get(tweetId)) !== undefined
}

export async function getIndexedCount(handle: string): Promise<number> {
  return db.tweets.where("profileHandle").equals(handle).count()
}

export async function deleteProfileData(handle: string) {
  await db.tweets.where("profileHandle").equals(handle).delete()
  await db.profiles.delete(handle)
}

export async function getStorageStats() {
  const tweetCount = await db.tweets.count()
  const profileCount = await db.profiles.count()
  let estimatedSize = 0

  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate()
    estimatedSize = estimate.usage ?? 0
  }

  return { tweetCount, profileCount, estimatedSize }
}
