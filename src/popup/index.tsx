import iconUrl from "url:~assets/icon.png"
import { useState, useEffect, useCallback } from "react"
import { IconBolt, IconPlayerPause, IconPlayerPlay, IconPlayerStop, IconRefresh, IconArrowLeft, IconSearch, IconHeart, IconEye, IconTrash, IconAlertTriangle } from "@tabler/icons-react"
import type { Profile } from "~lib/db"
import "~styles/popup.css"

interface SearchResult {
  tweet: { id: string; profileHandle: string; text: string; timestamp: number; likes: number; reposts: number; views: number }
  highlightedText: string
  score: number
}

const numberFormatter = new Intl.NumberFormat()
const compactFormatter = new Intl.NumberFormat(undefined, { notation: "compact" })
const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })

function formatRelativeTime(timestamp: number): string {
  const diff = timestamp - Date.now()
  const absDiff = Math.abs(diff)

  if (absDiff < 60_000) return relativeFormatter.format(Math.round(diff / 1000), "second")
  if (absDiff < 3_600_000) return relativeFormatter.format(Math.round(diff / 60_000), "minute")
  if (absDiff < 86_400_000) return relativeFormatter.format(Math.round(diff / 3_600_000), "hour")
  return relativeFormatter.format(Math.round(diff / 86_400_000), "day")
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

type View = "home" | "search" | "profile"

export default function Popup() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [stats, setStats] = useState({ tweetCount: 0, profileCount: 0, estimatedSize: 0 })
  const [activeHandle, setActiveHandle] = useState<string | null>(null)
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)
  const [view, setView] = useState<View>("home")
  const [syncStatus, setSyncStatus] = useState<string>("idle")
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => {
    loadData()
    detectActiveTab()

    const interval = setInterval(async () => {
      await loadData()
      if (activeHandle) {
        const countRes = await chrome.runtime.sendMessage({ type: "get-indexed-count", handle: activeHandle })
        if (countRes?.count !== undefined) {
          setActiveProfile(prev => prev ? { ...prev, totalIndexed: countRes.count } : prev)
        }
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [activeHandle])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      const response = await chrome.runtime.sendMessage({
        type: "search",
        options: {
          query: query.trim(),
          profileHandle: view === "profile" ? activeProfile?.handle : undefined,
          limit: 30
        }
      })
      setResults(response?.results ?? [])
    }, 200)
    return () => clearTimeout(timer)
  }, [query, view, activeProfile])

  async function loadData() {
    const [profilesRes, statsRes] = await Promise.all([
      chrome.runtime.sendMessage({ type: "get-profiles" }),
      chrome.runtime.sendMessage({ type: "get-stats" })
    ])
    setProfiles((profilesRes?.profiles ?? []).sort((a: Profile, b: Profile) => b.lastSyncAt - a.lastSyncAt))
    setStats(statsRes?.stats ?? { tweetCount: 0, profileCount: 0, estimatedSize: 0 })
  }

  async function detectActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) return

    const match = tab.url.match(/x\.com\/([a-zA-Z0-9_]{1,15})\/?$/)
    if (match) {
      const handle = match[1].toLowerCase()
      setActiveHandle(handle)

      const excluded = new Set(["home", "explore", "search", "notifications", "messages", "settings", "i", "compose", "login", "signup"])
      if (!excluded.has(handle)) {
        const profilesRes = await chrome.runtime.sendMessage({ type: "get-profiles" })
        const found = (profilesRes?.profiles ?? []).find((p: Profile) => p.handle === handle)
        if (found) {
          setActiveProfile(found)
          setSyncStatus(found.syncStatus)
        }
      }
    }
  }

  const sendTabCommand = useCallback(async (command: string) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    await chrome.tabs.sendMessage(tab.id, { type: "command", command })

    if (command === "start") setSyncStatus("indexing")
    else if (command === "pause") setSyncStatus("paused")
    else if (command === "resume") setSyncStatus("indexing")
    else if (command === "stop") setSyncStatus("idle")
  }, [])

  async function openTweet(handle: string, tweetId: string) {
    await chrome.tabs.create({ url: `https://x.com/${handle}/status/${tweetId}` })
  }

  async function openProfile(handle: string) {
    await chrome.tabs.create({ url: `https://x.com/${handle}` })
  }

  function handleDeleteProfile(handle: string, e: React.MouseEvent) {
    e.stopPropagation()
    setDeleteTarget(handle)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await chrome.runtime.sendMessage({ type: "delete-profile", handle: deleteTarget })
    await loadData()
    if (activeProfile?.handle === deleteTarget) {
      setActiveProfile(null)
    }
    setDeleteTarget(null)
  }

  function selectProfile(profile: Profile) {
    setActiveProfile(profile)
    setSyncStatus(profile.syncStatus)
    setView("profile")
    setQuery("")
    setResults([])
  }

  const isIndexing = syncStatus === "indexing" || syncStatus === "scrolling"
  const isPaused = syncStatus === "paused"
  const isComplete = syncStatus === "complete"

  return (
    <div className="popup">
      <div className="popup-header">
        <img src={iconUrl} alt="X Search" className="popup-logo" />
        <span className="popup-title">Search</span>
        {view !== "home" && (
          <button className="popup-back" onClick={() => { setView("home"); setActiveProfile(null); setQuery(""); setResults([]) }}>
            <IconArrowLeft size={14} /> Back
          </button>
        )}
        <span className="popup-subtitle">{numberFormatter.format(stats.tweetCount)} posts</span>
      </div>

      {/* Active tab indexing controls */}
      {activeHandle && view === "home" && (
        <div className="popup-active-tab">
          <div className="popup-active-tab-row">
            <div className="popup-active-tab-info">
              <span className="popup-active-tab-label">Current tab</span>
              <span className="popup-active-tab-handle">@{activeHandle}</span>
            </div>
            {activeProfile && (
              <span className="popup-active-tab-count">{compactFormatter.format(activeProfile.totalIndexed)} indexed</span>
            )}
          </div>
          <div className="popup-active-tab-row">
            <div className="popup-active-tab-actions">
              {!isIndexing && !isPaused && !isComplete && (
                <button className="popup-btn popup-btn--accent" onClick={() => sendTabCommand("start")}><IconBolt size={14} /> Index</button>
              )}
              {isIndexing && (
                <button className="popup-btn" onClick={() => sendTabCommand("pause")}><IconPlayerPause size={14} /> Pause</button>
              )}
              {isPaused && (
                <>
                  <button className="popup-btn popup-btn--accent" onClick={() => sendTabCommand("resume")}><IconPlayerPlay size={14} /> Resume</button>
                  <button className="popup-btn popup-btn--danger" onClick={() => sendTabCommand("stop")}><IconPlayerStop size={14} /> Stop</button>
                </>
              )}
              {isComplete && (
                <button className="popup-btn" onClick={() => sendTabCommand("start")}><IconRefresh size={14} /> Re-index</button>
              )}
            </div>
            {(isIndexing || isPaused || isComplete) && (
              <span className={`popup-badge popup-badge--${isIndexing ? "indexing" : isPaused ? "paused" : "complete"}`}>
                <span className="popup-badge-dot" />
                {isIndexing ? "Indexing" : isPaused ? "Paused" : "Complete"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Profile view header */}
      {view === "profile" && activeProfile && (
        <div className="popup-active-tab">
          <div className="popup-active-tab-info">
            <span className="popup-active-tab-handle">@{activeProfile.handle}</span>
            <span className="popup-active-tab-count">{compactFormatter.format(activeProfile.totalIndexed)} posts</span>
          </div>
          <button className="popup-btn popup-btn--danger popup-btn--sm" onClick={(e) => handleDeleteProfile(activeProfile.handle, e)}>
            Delete
          </button>
        </div>
      )}

      <div className="popup-search">
        <input
          type="text"
          placeholder={view === "profile" ? `Search @${activeProfile?.handle}...` : "Search all indexed posts..."}
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {/* Search results */}
      {query.trim() && results.length > 0 ? (
        <div className="popup-profiles">
          <div className="popup-section-title">
            {results.length} result{results.length === 1 ? "" : "s"}
          </div>
          {results.map(r => (
            <div
              key={r.tweet.id}
              className="profile-card"
              onClick={() => openTweet(r.tweet.profileHandle, r.tweet.id)}
            >
              <div className="profile-info">
                <div
                  className="profile-name result-text"
                  dangerouslySetInnerHTML={{ __html: r.highlightedText }}
                />
                <div className="profile-handle">
                  @{r.tweet.profileHandle} · {dateFormatter.format(r.tweet.timestamp)}
                </div>
              </div>
              <div className="profile-stats">
                <div className="profile-count"><IconHeart size={12} /> {compactFormatter.format(r.tweet.likes)}</div>
                {r.tweet.views > 0 && <div className="profile-synced"><IconEye size={12} /> {compactFormatter.format(r.tweet.views)}</div>}
              </div>
            </div>
          ))}
        </div>
      ) : query.trim() && results.length === 0 ? (
        <div className="popup-empty">
          <div className="popup-empty-icon"><IconSearch size={40} /></div>
          <div className="popup-empty-text">No results for "{query}"</div>
        </div>
      ) : view === "home" && profiles.length > 0 ? (
        <div className="popup-profiles">
          <div className="popup-section-title">Indexed Profiles</div>
          {profiles.map(p => (
            <div key={p.handle} className="profile-card" onClick={() => selectProfile(p)}>
              <div className="profile-avatar">
                {p.avatarUrl && <img src={p.avatarUrl} alt="" />}
              </div>
              <div className="profile-info">
                <div className="profile-name">{p.displayName || p.handle}</div>
                <div className="profile-handle">@{p.handle}</div>
              </div>
              <div className="profile-stats">
                <div className="profile-count">{numberFormatter.format(p.totalIndexed)}</div>
                <div className="profile-synced">{formatRelativeTime(p.lastSyncAt)}</div>
                <div className="profile-stats-row">
                  <button className="profile-delete" onClick={(e) => handleDeleteProfile(p.handle, e)} title="Delete profile">
                    <IconTrash size={14} />
                  </button>
                  {p.syncStatus !== "idle" && (
                    <div className={`profile-status profile-status--${p.syncStatus}`}>
                      {p.syncStatus}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : view === "home" ? (
        <div className="popup-empty">
          <div className="popup-empty-icon"><IconBolt size={40} /></div>
          <div className="popup-empty-text">No profiles indexed yet</div>
          <div className="popup-empty-hint">Visit any X profile and click "Index" above to start scanning</div>
        </div>
      ) : view === "profile" ? (
        <div className="popup-empty">
          <div className="popup-empty-icon"><IconSearch size={40} /></div>
          <div className="popup-empty-text">Search @{activeProfile?.handle}</div>
          <div className="popup-empty-hint">Start typing to search {compactFormatter.format(activeProfile?.totalIndexed ?? 0)} indexed posts</div>
        </div>
      ) : null}

      <div className="popup-footer">
        <span>{formatBytes(stats.estimatedSize)} used</span>
        {profiles.length > 0 && (
          <span>{profiles.length} profile{profiles.length === 1 ? "" : "s"}</span>
        )}
      </div>

      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon"><IconAlertTriangle size={24} /></div>
            <div className="modal-title">Delete profile</div>
            <div className="modal-text">All indexed data for <strong>@{deleteTarget}</strong> will be permanently deleted.</div>
            <div className="modal-actions">
              <button className="popup-btn" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="popup-btn popup-btn--danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
