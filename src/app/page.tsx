'use client'

import { useState, useEffect, useCallback } from 'react'
import { WaitingList } from '@/components/WaitingList'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useTheme } from '@/components/ThemeProvider'

const COOLDOWN_MS = 24 * 60 * 60 * 1000 // 24 hours

function getStoredUser() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('hf_user')
    if (!raw) return null
    return JSON.parse(raw) as { email: string; name: string; lastPlayed?: number }
  } catch { return null }
}

function storeUser(email: string, name: string, lastPlayed?: number) {
  localStorage.setItem('hf_user', JSON.stringify({ email, name, lastPlayed }))
}

export default function Home() {
  const [userEmail, setUserEmail] = useState('')
  const [userName, setUserName] = useState('')
  const [isVerified, setIsVerified] = useState(false)
  const [canPlay, setCanPlay] = useState(true)
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null)
  const [followPlayUsed, setFollowPlayUsed] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const { theme } = useTheme()

  // Check localStorage on mount for returning users, then verify cooldown server-side
  useEffect(() => {
    const stored = getStoredUser()
    if (stored?.email && stored?.name) {
      setUserEmail(stored.email)
      setUserName(stored.name)
      // Apply local cooldown immediately for fast UI
      if (stored.lastPlayed) {
        const remaining = stored.lastPlayed + COOLDOWN_MS - Date.now()
        if (remaining > 0) {
          setCanPlay(false)
          setCooldownEnd(stored.lastPlayed + COOLDOWN_MS)
        }
      }
      // Verify cooldown server-side (catches other devices / cleared localStorage)
      fetch('/api/scores/cooldown?email=' + encodeURIComponent(stored.email))
        .then(res => res.json())
        .then(data => {
          if (data.followPlayUsed) setFollowPlayUsed(true)
          if (data.cooldownEnd && data.cooldownEnd > Date.now()) {
            setCanPlay(false)
            setCooldownEnd(data.cooldownEnd)
            // Sync local storage
            storeUser(stored.email, stored.name, data.cooldownEnd - COOLDOWN_MS)
          }
        })
        .catch(() => { /* ignore, local check is fallback */ })
    }
  }, [])

  const handleWaitingListComplete = async (email: string, name: string) => {
    setUserEmail(email)
    setUserName(name)
    storeUser(email, name, getStoredUser()?.lastPlayed)

    // Check cooldown server-side before allowing play
    try {
      const res = await fetch('/api/scores/cooldown?email=' + encodeURIComponent(email))
      const data = await res.json()
      if (data.cooldownEnd && data.cooldownEnd > Date.now()) {
        setCanPlay(false)
        setCooldownEnd(data.cooldownEnd)
        storeUser(email, name, data.cooldownEnd - COOLDOWN_MS)
      }
      if (data.followPlayUsed) setFollowPlayUsed(true)
    } catch { /* fallback: allow play */ }

    setIsVerified(true)
  }

  // Called from hero for returning users
  const handleReturningUserPlay = useCallback(() => {
    setIsVerified(true)
  }, [])

  // Called when a game ends
  const handleGamePlayed = useCallback(() => {
    const now = Date.now()
    storeUser(userEmail, userName, now)
    setCanPlay(false)
    setCooldownEnd(now + COOLDOWN_MS)
  }, [userEmail, userName])

  // Called when follow-play is granted
  const handleFollowPlayGranted = useCallback(() => {
    setCanPlay(true)
    setCooldownEnd(null)
    setFollowPlayUsed(true)
  }, [])


  return (
    <main>
      {/* Logo */}
      <button
        onClick={() => { setIsVerified(false); setResetKey(k => k + 1) }}
        className="fixed top-[15px] sm:top-[10px] left-5 z-50 cursor-pointer"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Head Formula"
          className={`w-12 h-12 sm:w-13 sm:h-13 ${theme === 'dark' ? 'invert' : ''}`}
        />
      </button>
      {/* Theme Toggle */}
      <div className="fixed top-5 right-5 z-50">
        <ThemeToggle />
      </div>
      <WaitingList
        onComplete={handleWaitingListComplete}
        returningUser={userEmail && userName ? { email: userEmail, name: userName } : null}
        canPlay={canPlay}
        cooldownEnd={cooldownEnd}
        onReturningUserPlay={handleReturningUserPlay}
        isVerified={isVerified}
        userEmail={userEmail}
        userName={userName}
        onGamePlayed={handleGamePlayed}
        onFollowPlayGranted={handleFollowPlayGranted}
        followPlayUsed={followPlayUsed}
        resetKey={resetKey}
      />
    </main>
  )
}
