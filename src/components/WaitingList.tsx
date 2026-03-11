'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { StarsBackground } from '@/components/ui/stars-background'
import { useTheme } from './ThemeProvider'
import { supabase } from '@/lib/supabase'
import { BlockBlastGame } from './BlockBlastGame'

// ── (shapes removed – now inline in OrbitingParticles) ────
type CircleConfig = { cx: number; cy: number; r: number }

// ── Orbiting Particles ────────────────────────────────────────────
function OrbitingParticles({ size, isDark }: { size: number; isDark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const center = size / 2
    const maxRadius = size * 0.4
    const particleCount = 260
    const transitionDuration = 3500
    const holdDuration = 3000

    // Logo: 3 circles aligned horizontally — 1 front center, 2 behind (left, right)
    const logoR = maxRadius * 0.7
    const behindOffset = maxRadius * 0.62
    const logoCircles: CircleConfig[] = [
      // Back-left
      { cx: -behindOffset * 0.7, cy: 0, r: logoR },
      // Back-right
      { cx: behindOffset * 0.7, cy: 0, r: logoR },
      // Front center
      { cx: 0, cy: 0, r: logoR },
    ]
    const ringThickness = 0.12

    // Split particles across 3 circles: ~30% each back, ~40% front
    const third1 = Math.floor(particleCount * 0.3)
    const third2 = Math.floor(particleCount * 0.6)

    const particles = Array.from({ length: particleCount }, (_, i) => {
      const r = Math.sqrt(Math.random()) * maxRadius
      return {
        index: i,
        angle: Math.random() * Math.PI * 2,
        speed: 0.002 + Math.random() * 0.005,
        baseR: r,
        rNorm: r / maxRadius,
        size: 1 + Math.random() * 1.6,
        opacity: 0.2 + Math.random() * 0.5,
      }
    })

    let raf: number
    const startTime = performance.now()

    const draw = (now: number) => {
      const elapsed = now - startTime
      const cycleDuration = holdDuration + transitionDuration
      const fullCycle = cycleDuration * 2
      const cycleTime = elapsed % fullCycle

      // phase 0: filled → logo, phase 1: logo → filled
      const phase = Math.floor(cycleTime / cycleDuration)
      const phaseTime = cycleTime % cycleDuration
      const isMorphing = phaseTime > holdDuration
      const morphProgress = isMorphing
        ? (phaseTime - holdDuration) / transitionDuration
        : 0
      const raw = morphProgress * morphProgress * (3 - 2 * morphProgress)
      // t: 0 = filled circle, 1 = logo outline
      const t = phase === 0 ? raw : 1 - raw

      ctx.clearRect(0, 0, size, size)
      const uniformSpeed = 0.003
      const uniformSize = 1.4

      for (const p of particles) {
        const currentSpeed = p.speed + (uniformSpeed - p.speed) * t
        p.angle += currentSpeed

        // Filled circle: particles spread across the entire area
        const filledX = Math.cos(p.angle) * p.baseR
        const filledY = Math.sin(p.angle) * p.baseR

        // Logo outline: particles compressed onto thin ring perimeter of 3 circles
        const isBack = p.index < third2 // belongs to one of the two back circles
        const circle = p.index < third1 ? logoCircles[0]
          : p.index < third2 ? logoCircles[1]
          : logoCircles[2]
        const ringR = circle.r * (1 - ringThickness + p.rNorm * ringThickness)
        const logoX = circle.cx + Math.cos(p.angle) * ringR
        const logoY = circle.cy + Math.sin(p.angle) * ringR

        // Hide back-circle particles that fall inside the front circle
        let alphaMultiplier = 1
        if (isBack) {
          const frontCircle = logoCircles[2]
          const dx = logoX - frontCircle.cx
          const dy = logoY - frontCircle.cy
          const distToFront = Math.sqrt(dx * dx + dy * dy)
          const innerEdge = frontCircle.r * (1 - ringThickness)
          if (distToFront < innerEdge) {
            // Fade out smoothly based on t and how deep inside the front circle
            alphaMultiplier = 1 - t
          }
        }

        // Lerp between the two states
        const px = filledX + (logoX - filledX) * t
        const py = filledY + (logoY - filledY) * t

        const drift = Math.sin(now * 0.001 + p.angle) * 1.5
        const x = center + px + drift
        const y = center + py + drift * 0.5

        ctx.beginPath()
        const currentSize = p.size + (uniformSize - p.size) * t
        ctx.arc(x, y, currentSize, 0, Math.PI * 2)
        const alpha = p.opacity * alphaMultiplier
        ctx.fillStyle = isDark
          ? `rgba(255,255,255,${alpha})`
          : `rgba(0,0,0,${alpha})`
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [size, isDark])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
    />
  )
}

type Step = 'hero' | 'pipeline' | 'contest' | 'email' | 'code' | 'success' | 'game' | 'leaderboard'

type LeaderboardEntry = {
  name: string
  score: number
  date: string
}

type WaitingListProps = {
  onComplete?: (email: string, name: string) => void
  returningUser?: { email: string; name: string } | null
  canPlay?: boolean
  cooldownEnd?: number | null
  onReturningUserPlay?: () => void
  isVerified?: boolean
  userEmail?: string
  userName?: string
  onGamePlayed?: () => void
  onFollowPlayGranted?: () => void
  followPlayUsed?: boolean
  resetKey?: number
}

function useCountdown(endTime: number | null | undefined) {
  const [remaining, setRemaining] = useState('')
  useEffect(() => {
    if (!endTime) return
    const tick = () => {
      const diff = endTime - Date.now()
      if (diff <= 0) { setRemaining(''); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRemaining(`${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [endTime])
  return remaining
}

export function WaitingList({ onComplete, returningUser, canPlay = true, cooldownEnd, onReturningUserPlay, isVerified, userEmail, userName, onGamePlayed, onFollowPlayGranted, followPlayUsed, resetKey }: WaitingListProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [step, setStep] = useState<Step>('hero')
  const countdown = useCountdown(cooldownEnd)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [playerName, setPlayerName] = useState('')
  const [nameError, setNameError] = useState('')
  const [checkingName, setCheckingName] = useState(false)
  const [error, setError] = useState('')
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (step === 'code') {
      setTimeout(() => codeInputRefs.current[0]?.focus(), 500)
    }
  }, [step])

  // Reset to hero when logo is clicked
  useEffect(() => {
    if (resetKey !== undefined && resetKey > 0) {
      setStep('hero')
    }
  }, [resetKey])

  // Transition to game step when verified, back to hero when unverified
  useEffect(() => {
    if (isVerified && step !== 'game') {
      setStep('game')
    }
    if (!isVerified && step === 'game') {
      setStep('hero')
    }
  }, [isVerified])

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/scores')
      if (res.ok) setLeaderboard(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchLeaderboard() }, [fetchLeaderboard])

  const [submitting, setSubmitting] = useState(false)
  const [isReturningFlow, setIsReturningFlow] = useState(false)
  const [returningCooldownEnd, setReturningCooldownEnd] = useState<number | null>(null)
  const returningCountdown = useCountdown(returningCooldownEnd)

  const [emailCooldownEnd, setEmailCooldownEnd] = useState<number | null>(null)
  const emailCooldown = useCountdown(emailCooldownEnd)

  const handleNameSubmit = async () => {
    const trimmed = playerName.trim()
    if (!trimmed) return
    setCheckingName(true)
    setNameError('')
    try {
      const res = await fetch('/api/scores/check-name?name=' + encodeURIComponent(trimmed))
      const data = await res.json()
      if (data.taken) {
        setNameError('Username already taken')
      } else {
        setStep('email')
      }
    } catch {
      // If check fails, let them proceed (server will catch it on submit)
      setStep('email')
    } finally {
      setCheckingName(false)
    }
  }

  const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!email || submitting) return
    setSubmitting(true)
    setError('')
    setEmailCooldownEnd(null)
    try {
      // Check cooldown server-side before sending OTP
      const cooldownRes = await fetch('/api/scores/cooldown?email=' + encodeURIComponent(email.trim()))
      const cooldownData = await cooldownRes.json()
      if (!cooldownData.canPlay || (cooldownData.cooldownEnd && cooldownData.cooldownEnd > Date.now())) {
        setEmailCooldownEnd(cooldownData.cooldownEnd || Date.now() + 24 * 60 * 60 * 1000)
        setError('You already played today. Come back later!')
        setSubmitting(false)
        return
      }

      // Check if this email is already associated with a different username (skip for returning users)
      if (!isReturningFlow && cooldownData.existingName && playerName.trim() && cooldownData.existingName.toLowerCase() !== playerName.trim().toLowerCase()) {
        setError(`This email is already linked to username "${cooldownData.existingName}"`)
        setSubmitting(false)
        return
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({ email: email.trim() })
      if (otpError) {
        console.log('OTP Error:', otpError.status, otpError.message, otpError)
        if (otpError.status === 429 || otpError.message?.toLowerCase().includes('rate')) {
          setError('Too many attempts. Wait a minute and try again.')
        } else {
          setError('Something went wrong. Try again.')
        }
        setSubmitting(false)
        return
      }
      setStep('code')
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) return
    const newCode = [...code]
    newCode[index] = value
    setCode(newCode)

    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus()
    }

    if (index === 5 && value) {
      const isComplete = newCode.every(d => d.length === 1)
      if (isComplete) {
        verifyCode(newCode.join(''))
      }
    }
  }

  const verifyCode = async (token: string) => {
    setSubmitting(true)
    setError('')
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: 'email',
      })
      if (verifyError) {
        setError('Invalid code. Try again.')
        setCode(['', '', '', '', '', ''])
        setTimeout(() => codeInputRefs.current[0]?.focus(), 100)
        setSubmitting(false)
        return
      }
      await supabase.from('waiting_list').upsert(
        { email: email.trim() },
        { onConflict: 'email' }
      )

      // Returning flow: recover name and check cooldown from scores table
      let finalName = playerName.trim()
      if (isReturningFlow) {
        const { data: scoreData } = await supabase
          .from('scores')
          .select('name, created_at')
          .eq('email', email.trim())
          .order('created_at', { ascending: false })
          .limit(1)
        if (scoreData?.[0]) {
          if (scoreData[0].name) {
            finalName = scoreData[0].name
          }
          // Check if last play was within 24h
          const lastPlayed = new Date(scoreData[0].created_at).getTime()
          const cooldownMs = 24 * 60 * 60 * 1000
          const remaining = lastPlayed + cooldownMs - Date.now()
          if (remaining > 0) {
            // Check if follow-play was used after this score
            const { data: followPlay } = await supabase
              .from('follow_plays')
              .select('created_at')
              .eq('email', email.trim())
              .gte('created_at', scoreData[0].created_at)
              .limit(1)

            if (!followPlay || followPlay.length === 0) {
              setReturningCooldownEnd(lastPlayed + cooldownMs)
            }
          }
        }
        if (!finalName) {
          finalName = email.trim().split('@')[0].slice(0, 20)
        }
        setPlayerName(finalName)
      }

      onComplete?.(email, finalName)
    } catch {
      setError('Verification failed. Try again.')
      setCode(['', '', '', '', '', ''])
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirmCode = () => {
    if (code.every(d => d !== '')) {
      verifyCode(code.join(''))
    }
  }

  const handleResendCode = async () => {
    setError('')
    try {
      await supabase.auth.signInWithOtp({ email: email.trim() })
    } catch { /* ignore */ }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
    }
  }

  const handleBack = () => {
    if (step === 'code') {
      setStep('email')
      setCode(['', '', '', '', '', ''])
      setError('')
    }
  }

  const handleEmailBack = () => {
    if (isReturningFlow) {
      setIsReturningFlow(false)
      setStep('hero')
    } else {
      setStep('contest')
    }
    setError('')
  }

  const handleGoToGame = () => {
    setStep('game')
  }

  const handleShareOnX = async () => {
    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}']
    const currentName = returningUser?.name || userName || playerName
    const top5 = leaderboard.slice(0, 5)
    const lines = top5.map((entry, i) => {
      const rank = i < 3 ? medals[i] : `${i + 1}.`
      const isMe = currentName && entry.name.toLowerCase() === currentName.toLowerCase()
      return `${rank} ${entry.name}${isMe ? ' (me)' : ''} — ${entry.score.toLocaleString()}`
    })
    const imInTop5 = currentName && top5.some(e => e.name.toLowerCase() === currentName.toLowerCase())
    const text = `headformula leaderboard \u{1F3C6}\n\n${lines.join('\n')}\n\nCan you beat ${imInTop5 ? 'me' : 'them'}? #1 wins 1 SOL\nhttps://headformula.studio`
    if (navigator.share) {
      try {
        await navigator.share({ text })
      } catch { /* user cancelled */ }
    } else {
      window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank')
    }
  }

  // Follow-to-play: open X profile, wait for user to return, grant play
  const [followPlayPending, setFollowPlayPending] = useState(false)
  const followPlayStartRef = useRef<number>(0)

  const handleFollowToPlay = () => {
    const email = returningUser?.email
    if (!email) return
    followPlayStartRef.current = Date.now()
    setFollowPlayPending(true)
    window.open('https://x.com/headformula', '_blank')
  }

  useEffect(() => {
    if (!followPlayPending) return
    const email = returningUser?.email
    if (!email) return

    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return
      const elapsed = Date.now() - followPlayStartRef.current
      if (elapsed < 5000) return // min 5 seconds

      setFollowPlayPending(false)
      try {
        const res = await fetch('/api/scores/follow-play', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        if (res.ok) {
          onFollowPlayGranted?.()
        }
      } catch { /* ignore */ }
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [followPlayPending, returningUser?.email, onFollowPlayGranted])

  // ── Pipeline products ─────────────────────────────────────────────
  const products = [
    { name: 'Spicyy', date: 'Coming Soon', blur: 3 },
    { name: null, date: 'Q2 2026', blur: 6 },
    { name: null, date: 'Q3 2026', blur: 8 },
    { name: null, date: 'Q3 2026', blur: 10 },
    { name: null, date: 'Q4 2026', blur: 12 },
  ]

  // ── Leaderboard teaser (list) ────────────────────────────────────
  const LeaderboardTeaser = () => (
    <div className={`rounded-2xl border backdrop-blur-sm p-4 transition-colors duration-500 ${
      isDark ? 'border-white/[0.08] bg-white/[0.03]' : 'border-black/[0.08] bg-black/[0.03]'
    }`}>
      <div className="flex items-center justify-center mb-3">
        <h3 className={`text-xs font-semibold uppercase tracking-widest text-center ${isDark ? 'text-white/50' : 'text-black/50'}`}>Leaderboard</h3>
      </div>
      {leaderboard.length === 0 ? (
        <p className={`text-xs text-center py-4 ${isDark ? 'text-white/20' : 'text-black/20'}`}>No scores yet. Be the first.</p>
      ) : (
        <div className="space-y-0.5">
          {leaderboard.slice(0, 5).map((entry, i) => (
            <div
              key={`${entry.name}-${entry.score}-${i}`}
              className={`flex items-center justify-between py-1.5 px-2.5 rounded-lg transition-colors ${
                i === 0 ? 'bg-yellow-400/10' : i === 1 ? (isDark ? 'bg-white/[0.04]' : 'bg-black/[0.04]') : i === 2 ? 'bg-orange-400/5' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold w-5 text-right tabular-nums ${
                  i === 0 ? 'text-yellow-400' : i === 1 ? (isDark ? 'text-white/50' : 'text-black/50') : i === 2 ? 'text-orange-400' : (isDark ? 'text-white/20' : 'text-black/20')
                }`}>
                  {i === 0 ? '\u{1F947}' : i === 1 ? '\u{1F948}' : i === 2 ? '\u{1F949}' : `${i + 1}`}
                </span>
                <span className={`text-xs truncate max-w-[100px] ${isDark ? 'text-white/80' : 'text-black/80'}`}>{entry.name}</span>
              </div>
              <span className={`text-xs font-bold tabular-nums ${isDark ? 'text-white' : 'text-black'}`}>{entry.score.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ── Podium (top 3) ─────────────────────────────────────────────────
  const podiumContent = useMemo(() => {
    const top3 = leaderboard.slice(0, 3)
    if (top3.length === 0) {
      return (
        <p className={`text-xs text-center py-4 ${isDark ? 'text-white/20' : 'text-black/20'}`}>No scores yet. Be the first.</p>
      )
    }
    // Order: 2nd, 1st, 3rd
    const ordered = [top3[1], top3[0], top3[2]].filter(Boolean)
    const heights = ['h-24 sm:h-32', 'h-32 sm:h-44', 'h-20 sm:h-28']
    const colors = [
      isDark ? 'bg-white/[0.06] border-white/[0.08]' : 'bg-black/[0.04] border-black/[0.06]',
      'bg-yellow-400/10 border-yellow-400/20',
      isDark ? 'bg-white/[0.04] border-white/[0.06]' : 'bg-black/[0.03] border-black/[0.05]',
    ]

    return (
      <div className="flex items-end justify-center gap-3 sm:gap-5">
        {ordered.map((entry, i) => (
          <motion.div
            key={entry ? `${entry.name}-${i}` : `empty-${i}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i, duration: 0.4 }}
            className="flex flex-col items-center"
          >
            {entry ? (
              <>
                <span className={`text-xs sm:text-sm font-medium truncate max-w-[90px] sm:max-w-[120px] mb-2 ${isDark ? 'text-white/70' : 'text-black/70'}`}>
                  {entry.name}
                </span>
                <div className={`w-24 sm:w-36 ${heights[i]} rounded-t-lg border border-b-0 backdrop-blur-sm ${colors[i]} flex items-center justify-center`}>
                  <span className={`text-sm sm:text-base font-bold tabular-nums ${
                    i === 1 ? (isDark ? 'text-yellow-400' : 'text-yellow-600') : isDark ? 'text-white/50' : 'text-black/50'
                  }`}>
                    {entry.score.toLocaleString()}
                  </span>
                </div>
              </>
            ) : (
              <>
                <span className={`text-xs sm:text-sm mb-2 ${isDark ? 'text-white/20' : 'text-black/20'}`}>---</span>
                <div className={`w-24 sm:w-36 ${heights[i]} rounded-t-lg border border-b-0 backdrop-blur-sm ${isDark ? 'bg-white/[0.02] border-white/[0.05]' : 'bg-black/[0.02] border-black/[0.04]'} flex items-center justify-center`}>
                  <span className={`text-sm sm:text-base ${isDark ? 'text-white/15' : 'text-black/15'}`}>-</span>
                </div>
              </>
            )}
          </motion.div>
        ))}
      </div>
    )
  }, [leaderboard, isDark])

  return (
    <div className={`relative w-full ${step === 'game' ? 'h-svh overflow-hidden' : 'min-h-svh overflow-x-hidden overflow-y-auto'} transition-colors duration-500 ${isDark ? 'bg-black' : 'bg-white'}`}>
      {/* Stars background */}
      {step !== 'game' && (
        <div className="absolute inset-0 z-0">
          <StarsBackground
            className="h-full w-full"
            starColor={isDark ? '#ffffff' : '#000000'}
            speed={60}
            factor={0.03}
            pointerEvents={false}
          />
        </div>
      )}

      {/* Content */}
      <div className={`relative z-10 flex ${step === 'game' ? 'h-svh' : 'min-h-svh'} items-center justify-center ${step === 'game' ? '' : 'px-4 pt-24 pb-12 sm:py-12'}`}>
        <div className={`${step === 'game' ? 'w-full h-full' : 'w-full max-w-md sm:max-w-lg'}`}>
          <AnimatePresence mode="wait">

            {/* ──────────────── STEP 1: HERO ──────────────── */}
            {step === 'hero' && (
              <motion.div
                key="hero"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -30 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="space-y-10 text-center"
              >
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.6 }}
                  className="space-y-5"
                >
                  <h1 className={`text-4xl sm:text-5xl font-black leading-[1.05] tracking-tight transition-colors duration-500 ${isDark ? 'text-white' : 'text-black'}`}>
                    Products,<br className="sm:hidden" /> not promises.
                  </h1>
                  <p className={`text-base sm:text-lg font-light leading-relaxed max-w-sm mx-auto transition-colors duration-500 ${isDark ? 'text-white/50' : 'text-black/50'}`}>
                    We&apos;re rethinking how apps are built and reshaping what they can do. The first one is almost ready. Join the waitlist for early access and a chance to win 1 SOL.
                  </p>
                </motion.div>

                <motion.button
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.4 }}
                  onClick={() => setStep('pipeline')}
                  className={`rounded-full font-semibold px-10 py-3.5 text-base transition-all duration-300 cursor-pointer ${
                    isDark
                      ? 'bg-white text-black hover:bg-white/90'
                      : 'bg-black text-white hover:bg-black/90'
                  }`}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {returningUser ? 'See what\u2019s coming' : 'Join the waitlist'}
                </motion.button>

                {!returningUser && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7, duration: 0.5 }}
                    className={`-mt-5 text-center leading-tight ${isDark ? 'text-yellow-400/70' : 'text-yellow-600/70'}`}
                  >
                    <span className="text-sm font-medium">1 SOL up for grabs</span>
                    <br />
                    <span className="text-sm font-medium">subscribers only</span>
                  </motion.div>
                )}

                {/* Already subscribed link */}
                {!returningUser && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.9, duration: 0.5 }}
                    onClick={() => { setIsReturningFlow(true); setEmail(''); setPlayerName(''); setError(''); setEmailCooldownEnd(null); setStep('email') }}
                    className={`-mt-4 text-xs transition-colors cursor-pointer block mx-auto ${isDark ? 'text-white/30 hover:text-white/50' : 'text-black/30 hover:text-black/50'}`}
                    whileTap={{ scale: 0.95 }}
                  >
                    Already subscribed? Play now
                  </motion.button>
                )}

                {/* Returning user */}
                {returningUser && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.9, duration: 0.4 }}
                    className="space-y-2"
                  >
                    <div className={`w-full h-px ${isDark ? 'bg-white/10' : 'bg-black/10'}`} />
                    <p className={`text-xs ${isDark ? 'text-white/30' : 'text-black/30'}`}>
                      Welcome back, <span className={isDark ? 'text-white/60' : 'text-black/60'}>{returningUser.name}</span>
                    </p>
                    {canPlay ? (
                      <motion.button
                        onClick={onReturningUserPlay}
                        className={`rounded-full font-semibold px-8 py-2.5 text-sm transition-all duration-300 cursor-pointer ${
                          isDark
                            ? 'bg-white/10 text-white border border-white/15 hover:bg-white/15'
                            : 'bg-black/10 text-black border border-black/15 hover:bg-black/15'
                        }`}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        Play now
                      </motion.button>
                    ) : (
                      <div className="flex flex-col items-center space-y-3">
                        <p className={`text-xs ${isDark ? 'text-white/25' : 'text-black/25'}`}>
                          Next game in <span className={isDark ? 'text-white/50' : 'text-black/50'}>{countdown}</span>
                        </p>
                        {!followPlayUsed && (
                          !followPlayPending ? (
                            <motion.button
                              onClick={handleFollowToPlay}
                              className={`flex items-center justify-center gap-2 rounded-full font-medium py-2.5 px-6 text-sm transition-all duration-300 cursor-pointer ${
                                isDark
                                  ? 'bg-white/10 text-white border border-white/15 hover:bg-white/15'
                                  : 'bg-black/10 text-black border border-black/15 hover:bg-black/15'
                              }`}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.97 }}
                            >
                              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                              </svg>
                              Follow us to play now
                            </motion.button>
                          ) : (
                            <p className={`text-xs ${isDark ? 'text-white/40' : 'text-black/40'}`}>
                              Follow us, then come back here...
                            </p>
                          )
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* ──────────────── STEP 2: PIPELINE ──────────────── */}
            {step === 'pipeline' && (
              <motion.div
                key="pipeline"
                initial={{ opacity: 0, x: 80 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -80 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="space-y-10 text-center"
              >
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.5 }}
                  className="space-y-3"
                >
                  <h2 className={`text-4xl sm:text-5xl font-bold leading-[1.05] tracking-tight transition-colors duration-500 ${isDark ? 'text-white' : 'text-black'}`}>
                    In the pipeline
                  </h2>
                  <p className={`text-base sm:text-lg font-light leading-relaxed transition-colors duration-500 ${isDark ? 'text-white/40' : 'text-black/40'}`}>
                    Real products. Real progress. Not ready to reveal, yet.
                  </p>
                </motion.div>

                {/* Spheres */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                  className="flex flex-col items-center gap-8 py-4"
                >
                  {/* First product - hero size */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35, duration: 0.4 }}
                    className="flex flex-col items-center gap-3"
                  >
                    <div className="w-28 h-28 sm:w-36 sm:h-36 flex items-center justify-center">
                      <OrbitingParticles size={144} isDark={isDark} />
                    </div>
                    <div className="text-center">
                      <p className={`text-base font-semibold tracking-wide ${isDark ? 'text-white/80' : 'text-black/80'}`}>
                        {products[0].name}
                      </p>
                      <p className={`text-xs ${isDark ? 'text-white/40' : 'text-black/40'}`}>
                        {products[0].date}
                      </p>
                    </div>
                  </motion.div>

                  {/* Other products - row */}
                  <div className="flex items-start justify-center gap-6">
                    {products.slice(1).map((product, i) => (
                      <motion.div
                        key={i + 1}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 + i * 0.08, duration: 0.4 }}
                        className="flex flex-col items-center gap-2"
                      >
                        <div
                          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full"
                          style={{
                            filter: `blur(${product.blur}px)`,
                            background: isDark
                              ? 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.06) 100%)'
                              : 'radial-gradient(circle, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.04) 100%)',
                          }}
                        />
                        <p className={`text-[10px] ${isDark ? 'text-white/20' : 'text-black/20'}`}>
                          {product.date}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                {/* CTA */}
                {!returningUser && (
                  <motion.button
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8, duration: 0.4 }}
                    onClick={() => setStep('contest')}
                    className={`rounded-full font-semibold px-10 py-3.5 text-base transition-all duration-300 cursor-pointer ${
                      isDark
                        ? 'bg-white text-black hover:bg-white/90'
                        : 'bg-black text-white hover:bg-black/90'
                    }`}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Get early access
                  </motion.button>
                )}

                {returningUser && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8, duration: 0.4 }}
                    className="flex flex-col gap-3 items-center"
                  >
                    <motion.button
                      onClick={() => setStep('leaderboard')}
                      className={`rounded-full font-semibold px-10 py-3.5 text-base transition-all duration-300 cursor-pointer ${
                        isDark
                          ? 'bg-white text-black hover:bg-white/90'
                          : 'bg-black text-white hover:bg-black/90'
                      }`}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      Go to Leaderboard
                    </motion.button>
                  </motion.div>
                )}

                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.9 }}
                  onClick={() => setStep('hero')}
                  className={`-mt-6 text-xs transition-colors cursor-pointer block mx-auto ${isDark ? 'text-white/25 hover:text-white/40' : 'text-black/25 hover:text-black/40'}`}
                  whileTap={{ scale: 0.95 }}
                >
                  &larr; Back
                </motion.button>
              </motion.div>
            )}

            {/* ──────────────── STEP 3: CONTEST ──────────────── */}
            {step === 'contest' && (
              <motion.div
                key="contest"
                initial={{ opacity: 0, x: 80 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -80 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="space-y-8 text-center"
              >
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.5 }}
                  className="space-y-4"
                >
                  <h2 className={`text-4xl sm:text-5xl font-bold leading-[1.05] tracking-tight transition-colors duration-500 ${isDark ? 'text-white' : 'text-black'}`}>
                    Play the game.<br /> Top the board.<br />
                    <span className={isDark ? 'text-yellow-400' : 'text-yellow-600'}>Win 1 SOL.</span>
                  </h2>
                  <p className={`text-base sm:text-lg font-light leading-relaxed max-w-xs sm:max-w-md mx-auto transition-colors duration-500 ${isDark ? 'text-white/40' : 'text-black/40'}`}>
                    Join the waitlist. Play the game. Climb the leaderboard. When we drop our first product, #1 walks away with 1 SOL. That simple.
                  </p>
                </motion.div>

                {/* Name input */}
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                >
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Pick your username"
                      value={playerName}
                      onChange={(e) => { setPlayerName(e.target.value.slice(0, 20)); setNameError('') }}
                      maxLength={20}
                      className={`w-full backdrop-blur-sm rounded-full py-3 pl-14 pr-14 focus:outline-none text-center text-[16px] transition-colors duration-500 ${
                        nameError
                          ? 'border-red-400/60 ' + (isDark ? 'text-white bg-white/5 focus:border-red-400/80 placeholder:text-white/30' : 'text-black bg-black/5 focus:border-red-400/80 placeholder:text-black/30')
                          : isDark
                            ? 'text-white bg-white/5 border border-white/10 focus:border-white/30 placeholder:text-white/30'
                            : 'text-black bg-black/5 border border-black/10 focus:border-black/30 placeholder:text-black/30'
                      }`}
                    />
                    {nameError && (
                      <p className="text-red-400 text-xs mt-1.5 text-center">{nameError}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleNameSubmit}
                      disabled={!playerName.trim() || checkingName}
                      className={`absolute right-1.5 top-1.5 w-9 h-9 flex items-center justify-center rounded-full transition-all duration-300 cursor-pointer group overflow-hidden ${
                        playerName.trim() && !checkingName
                          ? isDark
                            ? 'text-black bg-white hover:bg-white/90'
                            : 'text-white bg-black hover:bg-black/90'
                          : isDark
                            ? 'text-white bg-white/10 opacity-30 cursor-not-allowed'
                            : 'text-black bg-black/10 opacity-30 cursor-not-allowed'
                      }`}
                    >
                      <span className="relative w-full h-full block overflow-hidden">
                        <span className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-full">
                          &rarr;
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center transition-transform duration-300 -translate-x-full group-hover:translate-x-0">
                          &rarr;
                        </span>
                      </span>
                    </button>
                  </div>
                </motion.div>

                {/* Podium */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                >
                  {podiumContent}
                </motion.div>

                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  onClick={() => setStep('pipeline')}
                  className={`-mt-4 text-xs transition-colors cursor-pointer block mx-auto ${isDark ? 'text-white/25 hover:text-white/40' : 'text-black/25 hover:text-black/40'}`}
                  whileTap={{ scale: 0.95 }}
                >
                  &larr; Back
                </motion.button>
              </motion.div>
            )}

            {/* ──────────────── EMAIL ──────────────── */}
            {step === 'email' && (
              <motion.div
                key="email"
                initial={{ opacity: 0, x: 80 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -80 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="space-y-6 text-center"
              >
                <div className="space-y-2">
                  <h2 className={`text-[1.7rem] sm:text-4xl font-bold leading-[1.1] tracking-tight transition-colors duration-500 ${isDark ? 'text-white' : 'text-black'}`}>
                    {isReturningFlow ? 'Welcome back' : 'Enter your email'}
                  </h2>
                  <p className={`text-sm font-light transition-colors duration-500 ${isDark ? 'text-white/40' : 'text-black/40'}`}>
                    {isReturningFlow ? 'Enter your email to verify and play' : 'We\'ll send you a verification code'}
                  </p>
                </div>

                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div className="relative">
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full backdrop-blur-sm rounded-full py-3 px-5 pr-14 focus:outline-none text-center text-[16px] transition-colors duration-500 ${
                        isDark
                          ? 'text-white bg-white/5 border border-white/10 focus:border-white/30 placeholder:text-white/30'
                          : 'text-black bg-black/5 border border-black/10 focus:border-black/30 placeholder:text-black/30'
                      }`}
                      required
                    />
                    <button
                      type="submit"
                      disabled={submitting}
                      className={`absolute right-1.5 top-1.5 w-9 h-9 flex items-center justify-center rounded-full transition-all duration-300 cursor-pointer group overflow-hidden ${
                        submitting
                          ? isDark
                            ? 'text-white bg-white/10 opacity-50 cursor-not-allowed'
                            : 'text-black bg-black/10 opacity-50 cursor-not-allowed'
                          : isDark
                            ? 'text-black bg-white hover:bg-white/90'
                            : 'text-white bg-black hover:bg-black/90'
                      }`}
                    >
                      {submitting ? (
                        <span className="animate-spin text-sm">&#9696;</span>
                      ) : (
                        <span className="relative w-full h-full block overflow-hidden">
                          <span className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-full">
                            &rarr;
                          </span>
                          <span className="absolute inset-0 flex items-center justify-center transition-transform duration-300 -translate-x-full group-hover:translate-x-0">
                            &rarr;
                          </span>
                        </span>
                      )}
                    </button>
                  </div>
                </form>

                {error && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-red-400"
                  >
                    {error}
                  </motion.p>
                )}

                {emailCooldownEnd && emailCooldown ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    <div className={`rounded-2xl border backdrop-blur-sm px-5 py-4 text-center transition-colors duration-500 ${
                      isDark ? 'border-white/[0.08] bg-white/[0.03]' : 'border-black/[0.08] bg-black/[0.03]'
                    }`}>
                      <p className={`text-sm font-semibold ${isDark ? 'text-white/70' : 'text-black/70'}`}>
                        You already played today
                      </p>
                      <p className={`text-xs mt-1 ${isDark ? 'text-white/40' : 'text-black/40'}`}>
                        You can play again in <span className={isDark ? 'text-white/70' : 'text-black/70'}>{emailCooldown}</span>
                      </p>
                    </div>
                    <motion.button
                      onClick={() => setStep('leaderboard')}
                      className={`w-full rounded-full font-semibold py-2.5 px-6 text-sm transition-all duration-300 cursor-pointer ${
                        isDark
                          ? 'bg-white text-black hover:bg-white/90'
                          : 'bg-black text-white hover:bg-black/90'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      Go to Leaderboard
                    </motion.button>
                    <motion.a
                      href="https://x.com/headformula"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center justify-center gap-2 rounded-full font-medium py-2.5 px-6 text-sm transition-all duration-300 cursor-pointer ${
                        isDark
                          ? 'bg-white/10 text-white border border-white/15 hover:bg-white/15'
                          : 'bg-black/10 text-black border border-black/15 hover:bg-black/15'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      Follow us
                    </motion.a>
                  </motion.div>
                ) : (
                  <p className={`text-xs transition-colors duration-500 ${isDark ? 'text-white/25' : 'text-black/25'}`}>
                    No spam. Just a code to verify you&apos;re real.
                  </p>
                )}

                <motion.button
                  onClick={handleEmailBack}
                  className={`mt-2 text-xs transition-colors cursor-pointer block mx-auto ${isDark ? 'text-white/25 hover:text-white/40' : 'text-black/25 hover:text-black/40'}`}
                  whileTap={{ scale: 0.95 }}
                >
                  &larr; Back
                </motion.button>
              </motion.div>
            )}

            {/* ──────────────── CODE ──────────────── */}
            {step === 'code' && (
              <motion.div
                key="code"
                initial={{ opacity: 0, x: 80 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 80 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="space-y-8 text-center"
              >
                <div className="space-y-2">
                  <h2 className={`text-[1.7rem] sm:text-4xl font-bold leading-[1.1] tracking-tight transition-colors duration-500 ${isDark ? 'text-white' : 'text-black'}`}>
                    Check your inbox
                  </h2>
                  <p className={`text-sm font-light transition-colors duration-500 ${isDark ? 'text-white/40' : 'text-black/40'}`}>
                    We sent a 6-digit code to
                  </p>
                  <p className={`text-sm font-medium transition-colors duration-500 ${isDark ? 'text-white/70' : 'text-black/70'}`}>
                    {email}
                  </p>
                </div>

                <div className="w-full">
                  <div className={`relative rounded-full py-4 px-5 border backdrop-blur-sm transition-colors duration-500 ${
                    isDark ? 'border-white/10 bg-white/5' : 'border-black/10 bg-black/5'
                  }`}>
                    <div className="flex items-center justify-center">
                      {code.map((digit, i) => (
                        <div key={i} className="flex items-center">
                          <div className="relative">
                            <input
                              ref={(el) => { codeInputRefs.current[i] = el }}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={1}
                              value={digit}
                              onChange={e => handleCodeChange(i, e.target.value)}
                              onKeyDown={e => handleKeyDown(i, e)}
                              className={`w-8 text-center text-xl bg-transparent border-none focus:outline-none focus:ring-0 appearance-none transition-colors duration-500 ${isDark ? 'text-white' : 'text-black'}`}
                              style={{ caretColor: 'transparent' }}
                              disabled={submitting}
                            />
                            {!digit && (
                              <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center pointer-events-none">
                                <span className={`text-xl transition-colors duration-500 ${isDark ? 'text-white/20' : 'text-black/20'}`}>0</span>
                              </div>
                            )}
                          </div>
                          {i < 5 && <span className={`text-xl transition-colors duration-500 ${isDark ? 'text-white/20' : 'text-black/20'}`}>|</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-red-400"
                  >
                    {error}
                  </motion.p>
                )}

                <p
                  onClick={handleResendCode}
                  className={`transition-colors cursor-pointer text-sm ${isDark ? 'text-white/40 hover:text-white/60' : 'text-black/40 hover:text-black/60'}`}
                >
                  Resend code
                </p>

                <div className="flex flex-col w-full gap-3">
                  <motion.button
                    onClick={handleBack}
                    disabled={submitting}
                    className={`rounded-full font-medium px-8 py-3 transition-colors cursor-pointer ${
                      isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-black/10 text-black hover:bg-black/20'
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Back
                  </motion.button>
                  <motion.button
                    onClick={handleConfirmCode}
                    disabled={!code.every(d => d !== '') || submitting}
                    className={`flex-1 rounded-full font-medium py-3 border transition-all duration-300 ${
                      code.every(d => d !== '') && !submitting
                        ? isDark
                          ? 'bg-white text-black border-transparent hover:bg-white/90 cursor-pointer'
                          : 'bg-black text-white border-transparent hover:bg-black/90 cursor-pointer'
                        : isDark
                          ? 'bg-white/5 text-white/50 border-white/10 cursor-not-allowed'
                          : 'bg-black/5 text-black/50 border-black/10 cursor-not-allowed'
                    }`}
                    whileHover={code.every(d => d !== '') && !submitting ? { scale: 1.02 } : {}}
                    whileTap={code.every(d => d !== '') && !submitting ? { scale: 0.98 } : {}}
                  >
                    {submitting ? 'Verifying...' : 'Confirm'}
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ──────────────── SUCCESS ──────────────── */}
            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 }}
                className="space-y-8 text-center"
              >
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                >
                  <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${
                    isDark ? 'bg-gradient-to-br from-white to-white/70' : 'bg-gradient-to-br from-black to-black/70'
                  }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-8 w-8 ${isDark ? 'text-black' : 'text-white'}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </motion.div>

                <div className="space-y-2">
                  <h2 className={`text-[1.7rem] sm:text-4xl font-bold leading-[1.1] tracking-tight transition-colors duration-500 ${isDark ? 'text-white' : 'text-black'}`}>
                    You&apos;re in.
                  </h2>
                  <p className={`text-sm font-light transition-colors duration-500 ${isDark ? 'text-white/40' : 'text-black/40'}`}>
                    We&apos;ll keep you posted at <span className={isDark ? 'text-white/70' : 'text-black/70'}>{email}</span>
                  </p>
                </div>

                {returningCooldownEnd && returningCountdown ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8, duration: 0.4 }}
                    className="space-y-4"
                  >
                    <p className={`text-sm font-light transition-colors duration-500 ${isDark ? 'text-white/40' : 'text-black/40'}`}>
                      Next game in <span className={isDark ? 'text-white/70' : 'text-black/70'}>{returningCountdown}</span>
                    </p>
                    <LeaderboardTeaser />
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8, duration: 0.4 }}
                    className="space-y-3"
                  >
                    <p className={`text-xs font-medium uppercase tracking-widest transition-colors duration-500 ${isDark ? 'text-white/30' : 'text-black/30'}`}>
                      Now the fun part
                    </p>
                    <motion.button
                      onClick={handleGoToGame}
                      className={`w-full rounded-full font-semibold py-4 text-base transition-all duration-300 cursor-pointer ${
                        isDark
                          ? 'bg-white text-black hover:bg-white/90'
                          : 'bg-black text-white hover:bg-black/90'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      Play the game
                    </motion.button>
                    <p className={`text-xs transition-colors duration-500 ${isDark ? 'text-white/25' : 'text-black/25'}`}>
                      #1 on the leaderboard wins 1 SOL. Good luck.
                    </p>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* ──────────────── LEADERBOARD ──────────────── */}
            {step === 'leaderboard' && (
              <motion.div
                key="leaderboard"
                initial={{ opacity: 0, x: 80 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -80 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="space-y-6 text-center"
              >
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.5 }}
                  className="space-y-3"
                >
                  <h2 className={`text-4xl sm:text-5xl font-bold leading-[1.05] tracking-tight transition-colors duration-500 ${isDark ? 'text-white' : 'text-black'}`}>
                    Leaderboard
                  </h2>
                  <p className={`text-sm font-light transition-colors duration-500 ${isDark ? 'text-white/40' : 'text-black/40'}`}>
                    #1 wins 1 SOL when we launch.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                  className={`rounded-2xl border backdrop-blur-sm p-5 transition-colors duration-500 ${
                    isDark ? 'border-white/[0.08] bg-white/[0.03]' : 'border-black/[0.08] bg-black/[0.03]'
                  }`}
                >
                  {leaderboard.length === 0 ? (
                    <p className={`text-sm text-center py-8 ${isDark ? 'text-white/20' : 'text-black/20'}`}>No scores yet. Be the first.</p>
                  ) : (
                    <>
                      {/* Podium - top 3 */}
                      {(() => {
                        const top3 = leaderboard.slice(0, 3)
                        const ordered = [top3[1], top3[0], top3[2]].filter(Boolean)
                        const heights = ['h-24 sm:h-32', 'h-32 sm:h-44', 'h-20 sm:h-28']
                        const podiumColors = [
                          isDark ? 'bg-white/[0.06] border-white/[0.08]' : 'bg-black/[0.04] border-black/[0.06]',
                          'bg-yellow-400/10 border-yellow-400/20',
                          isDark ? 'bg-white/[0.04] border-white/[0.06]' : 'bg-black/[0.03] border-black/[0.05]',
                        ]
                        return (
                          <div className="flex items-end justify-center gap-3 sm:gap-5 mb-4">
                            {ordered.map((entry, i) => (
                              <div key={entry ? `${entry.name}-${i}` : `empty-${i}`} className="flex flex-col items-center">
                                {entry ? (
                                  <>
                                    <span className={`text-xs sm:text-sm font-medium truncate max-w-[90px] sm:max-w-[120px] mb-2 ${isDark ? 'text-white/70' : 'text-black/70'}`}>
                                      {entry.name}
                                    </span>
                                    <div className={`w-24 sm:w-36 ${heights[i]} rounded-t-lg border border-b-0 backdrop-blur-sm ${podiumColors[i]} flex items-center justify-center`}>
                                      <span className={`text-sm sm:text-base font-bold tabular-nums ${
                                        i === 1 ? (isDark ? 'text-yellow-400' : 'text-yellow-600') : isDark ? 'text-white/50' : 'text-black/50'
                                      }`}>
                                        {entry.score.toLocaleString()}
                                      </span>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <span className={`text-xs sm:text-sm mb-2 ${isDark ? 'text-white/20' : 'text-black/20'}`}>---</span>
                                    <div className={`w-24 sm:w-36 ${heights[i]} rounded-t-lg border border-b-0 backdrop-blur-sm ${isDark ? 'bg-white/[0.02] border-white/[0.05]' : 'bg-black/[0.02] border-black/[0.04]'} flex items-center justify-center`}>
                                      <span className={`text-sm sm:text-base ${isDark ? 'text-white/15' : 'text-black/15'}`}>-</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        )
                      })()}

                      {/* Table - 4th place onwards */}
                      {leaderboard.length > 3 && (
                        <div className="space-y-1">
                          {leaderboard.slice(3).map((entry, i) => (
                            <div
                              key={`${entry.name}-${entry.score}-${i + 3}`}
                              className={`flex items-center justify-between py-2 px-3 rounded-xl transition-colors ${isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-black/[0.02]'}`}
                            >
                              <div className="flex items-center gap-3">
                                <span className={`text-sm font-bold w-6 text-center tabular-nums ${isDark ? 'text-white/20' : 'text-black/20'}`}>
                                  {i + 4}
                                </span>
                                <span className={`text-sm truncate max-w-[140px] ${isDark ? 'text-white/80' : 'text-black/80'}`}>{entry.name}</span>
                              </div>
                              <span className={`text-sm font-bold tabular-nums ${isDark ? 'text-white' : 'text-black'}`}>{entry.score.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </motion.div>

                <motion.button
                  type="button"
                  onClick={handleShareOnX}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.4 }}
                  className={`relative z-20 mx-auto flex items-center justify-center gap-2 rounded-full font-semibold px-10 py-3.5 text-base transition-all duration-300 cursor-pointer ${
                    isDark
                      ? 'bg-white/10 text-white border border-white/15 hover:bg-white/15'
                      : 'bg-black/10 text-black border border-black/15 hover:bg-black/15'
                  }`}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Share now
                </motion.button>

                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  onClick={() => setStep('pipeline')}
                  className={`text-xs transition-colors cursor-pointer block mx-auto ${isDark ? 'text-white/25 hover:text-white/40' : 'text-black/25 hover:text-black/40'}`}
                  whileTap={{ scale: 0.95 }}
                >
                  &larr; Back
                </motion.button>
              </motion.div>
            )}

            {/* ──────────────── GAME ──────────────── */}
            {step === 'game' && (
              <motion.div
                key="game"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="w-full h-full"
              >
                <BlockBlastGame
                  userEmail={userEmail}
                  userName={userName}
                  canPlay={canPlay}
                  cooldownEnd={cooldownEnd}
                  onGamePlayed={onGamePlayed}
                  followPlayUsed={followPlayUsed}
                  embedded
                />
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
