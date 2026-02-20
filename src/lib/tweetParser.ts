import type { Tweet } from "./db"
import { getTweetIdFromUrl } from "./profileDetector"

export function parseTweetFromDom(article: Element, profileHandle: string): Tweet | null {
  const tweetText = article.querySelector<HTMLElement>('[data-testid="tweetText"]')
  const timeEl = article.querySelector<HTMLTimeElement>("time[datetime]")
  const statusLink = article.querySelector<HTMLAnchorElement>('a[href*="/status/"]')

  if (!statusLink) return null
  const tweetId = getTweetIdFromUrl(statusLink.href)
  if (!tweetId) return null

  const timestamp = timeEl ? new Date(timeEl.dateTime).getTime() : Date.now()

  return {
    id: tweetId,
    profileHandle,
    text: tweetText?.innerText ?? "",
    timestamp,
    likes: parseEngagement(article, '[data-testid="like"], [data-testid="unlike"]'),
    reposts: parseEngagement(article, '[data-testid="retweet"]'),
    replies: parseEngagement(article, '[data-testid="reply"]'),
    views: parseEngagement(article, 'a[href*="/analytics"]'),
    hasMedia: article.querySelector('[data-testid="tweetPhoto"]') !== null,
    mediaUrls: extractMediaUrls(article),
    isRetweet: isRetweet(article),
    isQuote: article.querySelector('[data-testid="tweetText"] + div [data-testid="tweetText"]') !== null
      || article.querySelectorAll('[data-testid="tweetText"]').length > 1,
    quotedTweetId: extractQuotedTweetId(article)
  }
}

function parseEngagement(article: Element, selector: string): number {
  const el = article.querySelector(selector)
  if (!el) return 0

  const spans = el.querySelectorAll("span")
  for (const span of spans) {
    const text = span.textContent?.trim()
    if (text && /^[\d,.KkMm]+$/.test(text)) {
      return parseMetricText(text)
    }
  }
  return 0
}

function parseMetricText(text: string): number {
  const cleaned = text.replace(/,/g, "").trim().toUpperCase()
  if (cleaned.endsWith("K")) return Math.round(parseFloat(cleaned) * 1_000)
  if (cleaned.endsWith("M")) return Math.round(parseFloat(cleaned) * 1_000_000)
  return parseInt(cleaned, 10) || 0
}

function extractMediaUrls(article: Element): string[] {
  const imgs = article.querySelectorAll<HTMLImageElement>('[data-testid="tweetPhoto"] img')
  return Array.from(imgs).map(img => img.src).filter(Boolean)
}

function isRetweet(article: Element): boolean {
  const socialContext = article.querySelector('[data-testid="socialContext"]')
  if (!socialContext) return false
  return socialContext.textContent?.includes("reposted") ?? false
}

function extractQuotedTweetId(article: Element): string | undefined {
  const quotedLinks = article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')
  if (quotedLinks.length < 2) return undefined

  const secondLink = quotedLinks[1]
  return getTweetIdFromUrl(secondLink.href) ?? undefined
}

export function parseTweetsFromApiResponse(data: unknown, profileHandle: string): Tweet[] {
  const tweets: Tweet[] = []

  try {
    const instructions = extractInstructions(data)
    for (const instruction of instructions) {
      const entries = instruction?.entries ?? instruction?.moduleItems ?? []
      for (const entry of entries) {
        const tweet = extractTweetFromEntry(entry, profileHandle)
        if (tweet) tweets.push(tweet)
      }
    }
  } catch { }

  return tweets
}

function extractInstructions(data: unknown): any[] {
  if (!data || typeof data !== "object") return []

  const d = data as Record<string, any>
  const timeline =
    d?.data?.user?.result?.timeline_v2?.timeline ??
    d?.data?.user?.result?.timeline?.timeline ??
    d?.data?.user_result?.result?.timeline_v2?.timeline

  return timeline?.instructions ?? []
}

function extractTweetFromEntry(entry: any, profileHandle: string): Tweet | null {
  const result =
    entry?.content?.itemContent?.tweet_results?.result ??
    entry?.item?.itemContent?.tweet_results?.result

  if (!result) return null

  const tweet = result.tweet ?? result
  const legacy = tweet.legacy
  if (!legacy) return null

  const userLegacy = tweet.core?.user_results?.result?.legacy

  const tweetHandle = (userLegacy?.screen_name ?? "").toLowerCase()
  const isRT = legacy.retweeted_status_result !== undefined

  return {
    id: legacy.id_str ?? tweet.rest_id,
    profileHandle,
    text: legacy.full_text ?? "",
    timestamp: new Date(legacy.created_at).getTime(),
    likes: legacy.favorite_count ?? 0,
    reposts: legacy.retweet_count ?? 0,
    replies: legacy.reply_count ?? 0,
    views: parseInt(tweet.views?.count ?? "0", 10),
    hasMedia: (legacy.entities?.media?.length ?? 0) > 0,
    mediaUrls: (legacy.entities?.media ?? []).map((m: any) => m.media_url_https),
    isRetweet: isRT,
    isQuote: legacy.is_quote_status ?? false,
    quotedTweetId: legacy.quoted_status_id_str
  }
}
