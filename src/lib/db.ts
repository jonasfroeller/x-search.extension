import Dexie, { type EntityTable } from "dexie"

export interface Tweet {
  id: string
  profileHandle: string
  text: string
  timestamp: number
  likes: number
  reposts: number
  replies: number
  views: number
  hasMedia: boolean
  mediaUrls: string[]
  isRetweet: boolean
  isQuote: boolean
  quotedTweetId?: string
}

export type SyncStatus = "idle" | "indexing" | "paused" | "complete"

export interface Profile {
  handle: string
  displayName: string
  avatarUrl: string
  totalIndexed: number
  oldestTimestamp: number
  newestTimestamp: number
  lastSyncAt: number
  syncStatus: SyncStatus
}

const db = new Dexie("XSearchDB") as Dexie & {
  tweets: EntityTable<Tweet, "id">
  profiles: EntityTable<Profile, "handle">
}

db.version(1).stores({
  tweets: "id, profileHandle, timestamp, [profileHandle+timestamp]",
  profiles: "handle, lastSyncAt"
})

export { db }
