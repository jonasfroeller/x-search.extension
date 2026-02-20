import { db, type Tweet } from "./db"

export interface SearchOptions {
  query: string
  profileHandle?: string
  dateFrom?: number
  dateTo?: number
  mediaOnly?: boolean
  minLikes?: number
  sortBy?: "relevance" | "newest" | "oldest"
  limit?: number
}

export interface SearchResult {
  tweet: Tweet
  highlightedText: string
  score: number
}

export async function searchTweets(options: SearchOptions): Promise<SearchResult[]> {
  const { query, profileHandle, dateFrom, dateTo, mediaOnly, minLikes, sortBy = "relevance", limit = 50 } = options

  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (keywords.length === 0) return []

  let collection = profileHandle
    ? db.tweets.where("profileHandle").equals(profileHandle)
    : db.tweets.toCollection()

  const allTweets = await collection.toArray()

  const results: SearchResult[] = []

  for (const tweet of allTweets) {
    const textLower = tweet.text.toLowerCase()

    const matches = keywords.every(kw => textLower.includes(kw))
    if (!matches) continue

    if (dateFrom && tweet.timestamp < dateFrom) continue
    if (dateTo && tweet.timestamp > dateTo) continue
    if (mediaOnly && !tweet.hasMedia) continue
    if (minLikes && tweet.likes < minLikes) continue

    const score = calculateScore(textLower, keywords, tweet)
    results.push({
      tweet,
      highlightedText: highlightMatches(tweet.text, keywords),
      score
    })
  }

  results.sort((a, b) => {
    if (sortBy === "newest") return b.tweet.timestamp - a.tweet.timestamp
    if (sortBy === "oldest") return a.tweet.timestamp - b.tweet.timestamp
    return b.score - a.score
  })

  return results.slice(0, limit)
}

function calculateScore(textLower: string, keywords: string[], tweet: Tweet): number {
  let score = 0

  for (const kw of keywords) {
    let idx = 0
    while ((idx = textLower.indexOf(kw, idx)) !== -1) {
      score += 10
      idx += kw.length
    }
  }

  score += Math.log10(tweet.likes + 1) * 2
  score += Math.log10(tweet.views + 1)

  return score
}

function highlightMatches(text: string, keywords: string[]): string {
  const escaped = keywords.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const regex = new RegExp(`(${escaped.join("|")})`, "gi")
  return text.replace(regex, "<mark>$1</mark>")
}

export async function getProfileStats(handle: string) {
  const count = await db.tweets.where("profileHandle").equals(handle).count()
  const profile = await db.profiles.get(handle)
  return { count, profile }
}

export async function getAllProfiles() {
  return db.profiles.toArray()
}
