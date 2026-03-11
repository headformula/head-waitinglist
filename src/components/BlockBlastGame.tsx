'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import { useTheme } from './ThemeProvider'
import { unlockAudio, playPlace, playClear, playCombo, playGameOver, playInvalid } from '@/lib/sounds'

const GRID_SIZE = 8
const CELL_SIZE = 38
const CELL_GAP = 2
const GRID_PAD = 8 // p-2 = 8px
const MINI_CELL = 16
const MINI_GAP = 2

type Piece = {
  id: number
  shape: boolean[][]
  color: string
}

type LeaderboardEntry = {
  name: string
  score: number
  date: string
}

// ── Minimal Tech Glass Palette ──────────────────────────────────────
// 6 slightly desaturated colors, each with light / base / dark variants.
// Opacity 0.92 on placed blocks for subtle glass translucency.

type BlockColorSet = { light: string; base: string; dark: string }

const TECH_PALETTE: BlockColorSet[] = [
  // Cyan     – hsl(190 45% 60/56/52)
  { light: '#6CC4D2', base: '#5BB8C8', dark: '#4AACBE' },
  // Blue     – hsl(220 45% 60/56/52)
  { light: '#6C8FD2', base: '#5B7FC8', dark: '#4A6FBE' },
  // Violet   – hsl(265 40% 62/58/54)
  { light: '#977DD2', base: '#8B6DC8', dark: '#7F5DBE' },
  // Lime     – hsl(100 40% 59/55/51)
  { light: '#88CA6C', base: '#7BBF5E', dark: '#6EB450' },
  // Orange   – hsl( 25 50% 62/58/54)
  { light: '#D49A6C', base: '#CC8E5E', dark: '#C48250' },
  // Magenta  – hsl(330 45% 60/56/52)
  { light: '#D26C97', base: '#C85B8B', dark: '#BE4A7F' },
]

const COLORS = TECH_PALETTE.map(c => c.base)

const COLOR_VARIANTS: Record<string, BlockColorSet> = Object.fromEntries(
  TECH_PALETTE.map(c => [c.base, c]),
)

/** Returns inline styles for a placed / preview / ghost block cell. */
function blockStyle(color: string, mode: 'placed' | 'preview' | 'ghost' = 'placed'): React.CSSProperties {
  const v = COLOR_VARIANTS[color] ?? { light: color, base: color, dark: color }

  if (mode === 'preview') {
    return {
      background: `linear-gradient(180deg, ${v.light}40 0%, ${v.base}30 100%)`,
      border: `1px solid ${v.base}35`,
    }
  }

  const opacity = mode === 'ghost' ? 0.85 : 0.92

  return {
    background: `linear-gradient(180deg, ${v.light} 0%, ${v.base} 45%, ${v.dark} 100%)`,
    border: `1px solid ${v.dark}70`,
    boxShadow: 'none',
    opacity,
  }
}

const PIECE_TEMPLATES: boolean[][][] = [
  [[true]],
  [[true, true]],
  [[true], [true]],
  [[true, true, true]],
  [[true], [true], [true]],
  [[true, true], [true, true]],
  [[true, false], [true, false], [true, true]],
  [[false, true], [false, true], [true, true]],
  [[true, true, true], [false, true, false]],
  [[false, true, true], [true, true, false]],
  [[true, true, false], [false, true, true]],
  [[true, true, true], [true, true, true], [true, true, true]],
  [[true, true, true, true]],
  [[true], [true], [true], [true]],
  [[true, true], [true, true], [true, true]],
  [[true, true], [true, false]],
]

function generatePiece(id: number): Piece {
  const template = PIECE_TEMPLATES[Math.floor(Math.random() * PIECE_TEMPLATES.length)]
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]
  return { id, shape: template, color }
}

function canPlace(grid: (string | null)[][], piece: Piece, row: number, col: number): boolean {
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (piece.shape[r][c]) {
        const gr = row + r
        const gc = col + c
        if (gr < 0 || gr >= GRID_SIZE || gc < 0 || gc >= GRID_SIZE || grid[gr][gc] !== null) return false
      }
    }
  }
  return true
}

function canPlaceAnywhere(grid: (string | null)[][], piece: Piece): boolean {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (canPlace(grid, piece, r, c)) return true
    }
  }
  return false
}

function CooldownTimer({ cooldownEnd, isDark }: { cooldownEnd?: number | null; isDark: boolean }) {
  const [text, setText] = useState('')
  useEffect(() => {
    if (!cooldownEnd) return
    const tick = () => {
      const diff = cooldownEnd - Date.now()
      if (diff <= 0) { setText(''); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setText(`${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [cooldownEnd])
  if (!text) return null
  return (
    <p className={`text-xs ${isDark ? 'text-white/30' : 'text-black/30'}`}>
      Next game in <span className={isDark ? 'text-white/50' : 'text-black/50'}>{text}</span>
    </p>
  )
}

type BlockBlastProps = {
  userEmail?: string
  userName?: string
  canPlay?: boolean
  cooldownEnd?: number | null
  onGamePlayed?: () => void
  embedded?: boolean
  followPlayUsed?: boolean
}

export function BlockBlastGame({ userEmail = '', userName = '', canPlay = true, cooldownEnd, onGamePlayed, embedded = false, followPlayUsed = false }: BlockBlastProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { amount: 0.3 })
  const gridRef = useRef<HTMLDivElement>(null)

  const [grid, setGrid] = useState<(string | null)[][]>(() =>
    Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null))
  )
  const [pieces, setPieces] = useState<(Piece | null)[]>(() => [
    generatePiece(1), generatePiece(2), generatePiece(3),
  ])
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [clearing, setClearing] = useState<Set<string>>(new Set())
  const [gameOver, setGameOver] = useState(false)
  const [pieceIdCounter, setPieceIdCounter] = useState(4)

  // Drag state
  const [dragging, setDragging] = useState<{
    pieceIndex: number
    pos: { x: number; y: number }
  } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ row: number; col: number } | null>(null)

  // Particles for explosion effect
  type Particle = {
    id: number
    x: number
    y: number
    color: string
    vx: number
    vy: number
    size: number
    life: number
  }
  const [particles, setParticles] = useState<Particle[]>([])
  const particleId = useRef(0)

  // Screen shake
  const [shake, setShake] = useState(0)

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [playerName, setPlayerName] = useState(userName)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const leaderboardRef = useRef<HTMLDivElement>(null)
  const leaderboardInView = useInView(leaderboardRef, { amount: 0.2 })

  const draggedPiece = dragging ? pieces[dragging.pieceIndex] : null

  /** Spawn explosion particles from a set of grid cells. */
  const spawnParticles = useCallback((cells: Set<string>, gridEl: HTMLDivElement | null) => {
    if (!gridEl) return
    const rect = gridEl.getBoundingClientRect()
    const newParticles: Particle[] = []
    cells.forEach(key => {
      const [r, c] = key.split(',').map(Number)
      const cx = GRID_PAD + c * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2
      const cy = GRID_PAD + r * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2
      // 4-6 particles per cell
      const count = 4 + Math.floor(Math.random() * 3)
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8
        const speed = 60 + Math.random() * 120
        newParticles.push({
          id: particleId.current++,
          x: cx,
          y: cy,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 3 + Math.random() * 4,
          life: 1,
        })
      }
    })
    setParticles(prev => [...prev, ...newParticles])
  }, [])

  // Animate particles
  useEffect(() => {
    if (particles.length === 0) return
    let raf: number
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      setParticles(prev => {
        const next = prev
          .map(p => ({
            ...p,
            x: p.x + p.vx * dt,
            y: p.y + p.vy * dt,
            vy: p.vy + 300 * dt, // gravity
            life: p.life - dt * 1.8,
          }))
          .filter(p => p.life > 0)
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [particles.length > 0])

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/scores')
      if (res.ok) setLeaderboard(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchLeaderboard() }, [fetchLeaderboard])

  // Check game over
  useEffect(() => {
    const remaining = pieces.filter(Boolean) as Piece[]
    if (remaining.length > 0) {
      const anyCanPlace = remaining.some(p => canPlaceAnywhere(grid, p))
      if (!anyCanPlace) {
        setGameOver(true)
        playGameOver()
        onGamePlayed?.()
      }
    }
  }, [grid, pieces])

  // Auto-submit score when game over and name is already known
  const autoSubmitted = useRef(false)
  useEffect(() => {
    if (gameOver && playerName.trim() && !submitted && !submitting && !autoSubmitted.current) {
      autoSubmitted.current = true
      submitScore()
    }
  }, [gameOver])

  // Convert pointer position to the nearest grid cell (continuous, not just floor)
  const pointerToCell = useCallback((clientX: number, clientY: number): { row: number; col: number } | null => {
    if (!gridRef.current) return null
    const rect = gridRef.current.getBoundingClientRect()
    const x = clientX - rect.left - GRID_PAD
    const y = clientY - rect.top - GRID_PAD
    const col = Math.round(x / (CELL_SIZE + CELL_GAP) - 0.5)
    const row = Math.round(y / (CELL_SIZE + CELL_GAP) - 0.5)
    // Allow a generous margin outside the grid edges
    if (row < -1 || row > GRID_SIZE || col < -1 || col > GRID_SIZE) return null
    return { row: Math.max(0, Math.min(GRID_SIZE - 1, row)), col: Math.max(0, Math.min(GRID_SIZE - 1, col)) }
  }, [])

  /**
   * Find the best valid drop position near the pointer.
   * Searches a small radius around the raw cell for the closest spot where the piece fits.
   */
  const findBestDrop = useCallback((rawCell: { row: number; col: number } | null, piece: Piece): { row: number; col: number } | null => {
    if (!rawCell) return null
    // Try exact position first
    if (canPlace(grid, piece, rawCell.row, rawCell.col)) return rawCell
    // Search nearby cells in expanding radius (1-2 cells away)
    const SEARCH_RADIUS = 2
    let bestDist = Infinity
    let best: { row: number; col: number } | null = null
    for (let dr = -SEARCH_RADIUS; dr <= SEARCH_RADIUS; dr++) {
      for (let dc = -SEARCH_RADIUS; dc <= SEARCH_RADIUS; dc++) {
        if (dr === 0 && dc === 0) continue
        const r = rawCell.row + dr
        const c = rawCell.col + dc
        if (r < 0 || c < 0 || r >= GRID_SIZE || c >= GRID_SIZE) continue
        if (canPlace(grid, piece, r, c)) {
          const dist = dr * dr + dc * dc
          if (dist < bestDist) {
            bestDist = dist
            best = { row: r, col: c }
          }
        }
      }
    }
    return best
  }, [grid])

  // Pointer handlers
  const handlePointerDown = useCallback((index: number, e: React.PointerEvent) => {
    if (gameOver) return
    e.preventDefault()
    unlockAudio()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDragging({
      pieceIndex: index,
      pos: { x: e.clientX, y: e.clientY },
    })
  }, [gameOver])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return
    e.preventDefault()
    setDragging(prev => prev ? { ...prev, pos: { x: e.clientX, y: e.clientY } } : null)

    const piece = pieces[dragging.pieceIndex]
    if (!piece) return
    const offsetY = -60
    const rawCell = pointerToCell(
      e.clientX - Math.floor(piece.shape[0].length / 2) * (CELL_SIZE + CELL_GAP),
      e.clientY + offsetY - Math.floor(piece.shape.length / 2) * (CELL_SIZE + CELL_GAP)
    )
    setDropTarget(findBestDrop(rawCell, piece))
  }, [dragging, pieces, pointerToCell, findBestDrop])

  const handlePointerUp = useCallback(() => {
    if (!dragging || !draggedPiece) {
      setDragging(null)
      setDropTarget(null)
      return
    }

    if (dropTarget && !canPlace(grid, draggedPiece, dropTarget.row, dropTarget.col)) {
      playInvalid()
    }

    if (dropTarget && canPlace(grid, draggedPiece, dropTarget.row, dropTarget.col)) {
      // Place the piece
      const newGrid = grid.map(r => [...r])
      for (let r = 0; r < draggedPiece.shape.length; r++) {
        for (let c = 0; c < draggedPiece.shape[r].length; c++) {
          if (draggedPiece.shape[r][c]) {
            newGrid[dropTarget.row + r][dropTarget.col + c] = draggedPiece.color
          }
        }
      }

      const toClear = new Set<string>()
      for (let r = 0; r < GRID_SIZE; r++) {
        if (newGrid[r].every(cell => cell !== null)) {
          for (let c = 0; c < GRID_SIZE; c++) toClear.add(`${r},${c}`)
        }
      }
      for (let c = 0; c < GRID_SIZE; c++) {
        if (newGrid.every(row => row[c] !== null)) {
          for (let r = 0; r < GRID_SIZE; r++) toClear.add(`${r},${c}`)
        }
      }

      let points = draggedPiece.shape.flat().filter(Boolean).length * 10

      // Sound: piece placed
      playPlace()

      if (toClear.size > 0) {
        const newCombo = combo + 1
        setCombo(newCombo)
        points += toClear.size * 10 * newCombo

        // Count lines being cleared (rows + cols)
        let lineCount = 0
        for (let r = 0; r < GRID_SIZE; r++) {
          if (newGrid[r].every(cell => cell !== null)) lineCount++
        }
        for (let c = 0; c < GRID_SIZE; c++) {
          if (newGrid.every(row => row[c] !== null)) lineCount++
        }

        // Sound: line clear + combo
        playClear(lineCount)
        if (newCombo > 1) playCombo(newCombo)

        // Screen shake – intensity scales with lines
        setShake(lineCount)
        setTimeout(() => setShake(0), 400)

        setClearing(toClear)

        // Spawn explosion particles
        spawnParticles(toClear, gridRef.current)

        setTimeout(() => {
          const clearedGrid = newGrid.map(r => [...r])
          toClear.forEach(key => {
            const [r, c] = key.split(',').map(Number)
            clearedGrid[r][c] = null
          })
          setGrid(clearedGrid)
          setClearing(new Set())
        }, 400)
      } else {
        setCombo(0)
      }

      setGrid(newGrid)
      setScore(prev => prev + points)

      let newPieces: (Piece | null)[] = [pieces[0], pieces[1], pieces[2]]
      newPieces[dragging.pieceIndex] = null
      if (newPieces.every(p => p === null)) {
        const nextId = pieceIdCounter
        setPieceIdCounter(prev => prev + 3)
        newPieces = [generatePiece(nextId), generatePiece(nextId + 1), generatePiece(nextId + 2)]
      }
      setPieces(newPieces)
    }

    setDragging(null)
    setDropTarget(null)
  }, [dragging, draggedPiece, dropTarget, grid, pieces, combo, pieceIdCounter])

  const submitScore = async () => {
    if (!playerName.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: playerName.trim(),
          email: userEmail.trim(),
          score,
          joinWaitingList: false,
        }),
      })
      if (res.status === 429) {
        // Server rejected: already played within 24h
        // Score won't be saved, but still show game over
      }
      setSubmitted(true)
      await fetchLeaderboard()
    } catch { /* ignore */ }
    setSubmitting(false)
  }

  const resetGame = () => {
    setGrid(Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null)))
    const nextId = pieceIdCounter
    setPieceIdCounter(prev => prev + 3)
    setPieces([generatePiece(nextId), generatePiece(nextId + 1), generatePiece(nextId + 2)])
    setScore(0)
    setCombo(0)
    setGameOver(false)
    setClearing(new Set())
    setSubmitted(false)
    autoSubmitted.current = false
  }

  // Preview cells on grid
  const previewCells = new Set<string>()
  const isValidDrop = draggedPiece && dropTarget && canPlace(grid, draggedPiece, dropTarget.row, dropTarget.col)
  if (isValidDrop && draggedPiece && dropTarget) {
    for (let r = 0; r < draggedPiece.shape.length; r++) {
      for (let c = 0; c < draggedPiece.shape[r].length; c++) {
        if (draggedPiece.shape[r][c]) {
          previewCells.add(`${dropTarget.row + r},${dropTarget.col + c}`)
        }
      }
    }
  }

  const rank = leaderboard.filter(e => e.score > score).length + 1

  return (
    <div
      ref={sectionRef}
      className={`${embedded ? 'h-full' : 'min-h-screen'} flex flex-col items-center justify-center px-4 ${embedded ? 'py-4' : 'py-20'} relative select-none transition-colors duration-500 ${embedded ? '' : isDark ? 'bg-black' : 'bg-white'}`}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { setDragging(null); setDropTarget(null) }}
      style={{ touchAction: dragging ? 'none' : 'auto' }}
    >
      {!embedded && <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(99,102,241,0.08)_0%,_transparent_70%)]" />}

      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={(embedded || isInView) ? { opacity: 1, y: 0 } : { opacity: 0, y: 60 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className={`relative z-10 flex flex-col items-center ${embedded ? 'gap-4' : 'gap-8'}`}
      >
        {/* Prize Banner */}
        {!embedded && (
          <div className={`w-full max-w-sm rounded-2xl border backdrop-blur-sm px-5 py-3 text-center transition-colors duration-500 ${
            isDark
              ? 'border-purple-400/20 bg-gradient-to-r from-purple-500/10 via-transparent to-cyan-500/10'
              : 'border-purple-400/20 bg-gradient-to-r from-purple-500/5 via-transparent to-cyan-500/5'
          }`}>
            <p className={`text-sm font-semibold ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
              Up for grabs: <span className={`${isDark ? 'text-cyan-300' : 'text-cyan-600'}`}>1 SOL</span> for the #1 on the leaderboard
            </p>
          </div>
        )}

        {/* Title */}
        {!embedded && (
          <div className="text-center">
            <p className={`text-3xl font-light transition-colors duration-500 ${isDark ? 'text-white/60' : 'text-black/60'}`}>While you wait, play a little</p>
          </div>
        )}

        {/* Cooldown block */}
        {!canPlay && !gameOver && (
          <div className="flex flex-col items-center gap-6 py-12">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isDark ? 'bg-white/[0.06]' : 'bg-black/[0.06]'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className={`w-7 h-7 ${isDark ? 'text-white/30' : 'text-black/30'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <div className="text-center space-y-2">
              <p className={`text-base font-semibold ${isDark ? 'text-white/70' : 'text-black/70'}`}>
                You already played today
              </p>
              <CooldownTimer cooldownEnd={cooldownEnd} isDark={isDark} />
              <p className={`text-xs max-w-[240px] ${isDark ? 'text-white/25' : 'text-black/25'}`}>
                You can play once every 24 hours. Come back later to climb the leaderboard.
              </p>
            </div>
            {/* Mini leaderboard while waiting */}
            {leaderboard.length > 0 && (
              <div className={`w-full max-w-xs rounded-2xl border backdrop-blur-sm p-4 transition-colors duration-500 ${
                isDark ? 'border-white/[0.08] bg-white/[0.03]' : 'border-black/[0.08] bg-black/[0.03]'
              }`}>
                <h3 className={`text-xs font-semibold uppercase tracking-widest text-center mb-3 ${isDark ? 'text-white/50' : 'text-black/50'}`}>Leaderboard</h3>
                <div className="space-y-0.5">
                  {leaderboard.slice(0, 5).map((entry, i) => (
                    <div
                      key={`${entry.name}-${entry.score}-${i}`}
                      className={`flex items-center justify-between py-1.5 px-2.5 rounded-lg ${
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
              </div>
            )}
          </div>
        )}

        {/* Score */}
        {(canPlay || gameOver) && <div className="flex items-center gap-6">
          <div className="text-center">
            <div className={`text-xs uppercase tracking-widest transition-colors duration-500 ${isDark ? 'text-white/40' : 'text-black/40'}`}>Score</div>
            <div className={`text-2xl font-bold tabular-nums transition-colors duration-500 ${isDark ? 'text-white' : 'text-black'}`}>{score}</div>
          </div>
          {combo > 1 && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-center">
              <div className="text-xs text-yellow-400/60 uppercase tracking-widest">Combo</div>
              <div className="text-2xl font-bold text-yellow-400">x{combo}</div>
            </motion.div>
          )}
        </div>}

        {/* Grid */}
        {(canPlay || gameOver) && <div
          ref={gridRef}
          className={`relative rounded-2xl p-2 backdrop-blur-sm transition-colors duration-500 ${
            isDark ? 'bg-white/[0.03] border border-white/[0.06]' : 'bg-black/[0.03] border border-black/[0.06]'
          } ${shake > 0 ? 'animate-shake' : ''}`}
        >
          <div
            className="grid gap-[2px]"
            style={{
              gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL_SIZE}px)`,
              gridTemplateRows: `repeat(${GRID_SIZE}, ${CELL_SIZE}px)`,
            }}
          >
            {grid.map((row, r) =>
              row.map((cell, c) => {
                const key = `${r},${c}`
                const isPreview = previewCells.has(key)
                const isClearing = clearing.has(key)

                return (
                  <motion.div
                    key={key}
                    className={`
                      rounded-lg transition-all duration-150
                      ${cell ? '' : isDark ? 'bg-white/[0.04]' : 'bg-black/[0.04]'}
                      ${isPreview ? isDark ? 'ring-2 ring-white/30' : 'ring-2 ring-black/30' : ''}
                    `}
                    style={
                      isClearing
                        ? {
                            background: `radial-gradient(circle, #fff 0%, ${cell ?? '#fff'} 60%, transparent 100%)`,
                            boxShadow: `0 0 16px ${cell ?? '#fff'}90, 0 0 32px ${cell ?? '#fff'}40`,
                          }
                        : isPreview && draggedPiece
                          ? blockStyle(draggedPiece.color, 'preview')
                          : cell
                            ? blockStyle(cell)
                            : undefined
                    }
                    animate={
                      isClearing
                        ? { scale: [1, 1.3, 0], opacity: [1, 1, 0] }
                        : { scale: 1, opacity: 1 }
                    }
                    transition={
                      isClearing
                        ? { duration: 0.45, ease: 'easeOut' }
                        : { duration: 0.15 }
                    }
                  />
                )
              })
            )}
          </div>

          {/* Game Over overlay */}
          <AnimatePresence>
            {gameOver && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`absolute inset-0 rounded-2xl backdrop-blur-sm flex items-center justify-center ${isDark ? 'bg-black/80' : 'bg-white/80'}`}
              >
                <div className="text-center space-y-4 px-4">
                  <p className={`text-sm uppercase tracking-widest ${isDark ? 'text-white/50' : 'text-black/50'}`}>Game Over</p>
                  <p className={`text-4xl font-bold tabular-nums ${isDark ? 'text-white' : 'text-black'}`}>{score}</p>
                  {submitted ? (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
                      <p className={`text-sm ${isDark ? 'text-white/50' : 'text-black/50'}`}>
                        {rank === 1 ? "1st place!" : rank === 2 ? "2nd place!" : rank === 3 ? "3rd place!" : `${rank}th place`}
                        {' '}
                        <span className={`${isDark ? 'text-white/30' : 'text-black/30'}`}>
                          out of {leaderboard.length}
                        </span>
                      </p>
                    </motion.div>
                  ) : (
                    <p className={`text-xs ${isDark ? 'text-white/30' : 'text-black/30'}`}>
                      {submitting ? 'Saving score...' : ''}
                    </p>
                  )}
                  {canPlay ? (
                    <motion.button
                      onClick={resetGame}
                      className={`transition-colors text-xs cursor-pointer underline underline-offset-2 ${isDark ? 'text-white/40 hover:text-white/70' : 'text-black/40 hover:text-black/70'}`}
                      whileTap={{ scale: 0.95 }}
                    >
                      Play again
                    </motion.button>
                  ) : (
                    <CooldownTimer cooldownEnd={cooldownEnd} isDark={isDark} />
                  )}
                  <motion.button
                    onClick={async () => {
                      if (followPlayUsed) {
                        const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}']
                        const top5 = leaderboard.slice(0, 5)
                        const lines = top5.map((entry, i) => {
                          const r = i < 3 ? medals[i] : `${i + 1}.`
                          const isMe = playerName && entry.name.toLowerCase() === playerName.toLowerCase()
                          return `${r} ${entry.name}${isMe ? ' (me)' : ''} \u{2014} ${entry.score.toLocaleString()}`
                        })
                        const imInTop5 = playerName && top5.some(e => e.name.toLowerCase() === playerName.toLowerCase())
                        const text = `headformula leaderboard \u{1F3C6}\n\n${lines.join('\n')}\n\nCan you beat ${imInTop5 ? 'me' : 'them'}? #1 wins 1 SOL\nhttps://headformula.studio`
                        if (navigator.share) {
                          try {
                            await navigator.share({ text })
                          } catch { /* user cancelled */ }
                        } else {
                          window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank')
                        }
                      } else {
                        window.open('https://x.com/headformula', '_blank')
                      }
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
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
                    {followPlayUsed ? 'Share now' : 'Follow us'}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Explosion particles */}
          {particles.length > 0 && (
            <div className="absolute inset-0 pointer-events-none overflow-visible z-20">
              {particles.map(p => (
                <div
                  key={p.id}
                  className="absolute rounded-full"
                  style={{
                    left: p.x,
                    top: p.y,
                    width: p.size,
                    height: p.size,
                    backgroundColor: p.color,
                    opacity: p.life,
                    transform: `translate(-50%, -50%) scale(${0.5 + p.life * 0.5})`,
                    boxShadow: `0 0 ${p.size * 2}px ${p.color}80`,
                  }}
                />
              ))}
            </div>
          )}
        </div>}

        {/* Pieces tray */}
        {(canPlay || gameOver) && <div
          className="grid grid-cols-3 min-h-[100px]"
          style={{ width: `${GRID_SIZE * (CELL_SIZE + CELL_GAP) + GRID_PAD * 2}px`, touchAction: 'none' }}
        >
          {pieces.slice(0, 3).map((piece, index) => {
            if (!piece) return <div key={index} />
            const isDragging = dragging?.pieceIndex === index

            return (
              <div key={index} className="flex items-end justify-center">
                <motion.div
                  className={`
                    cursor-grab active:cursor-grabbing rounded-xl p-3 transition-all duration-200
                    ${isDragging ? 'opacity-30 scale-90' : isDark ? 'bg-white/[0.03] hover:bg-white/[0.06]' : 'bg-black/[0.03] hover:bg-black/[0.06]'}
                  `}
                  onPointerDown={(e) => handlePointerDown(index, e)}
                  whileHover={!isDragging ? { scale: 1.05 } : {}}
                >
                  <div
                    className="grid gap-[2px]"
                    style={{
                      gridTemplateColumns: `repeat(${piece.shape[0].length}, ${MINI_CELL}px)`,
                      gridTemplateRows: `repeat(${piece.shape.length}, ${MINI_CELL}px)`,
                    }}
                  >
                    {piece.shape.map((row, r) =>
                      row.map((filled, c) => (
                        <div
                          key={`${r}-${c}`}
                          className="rounded-md pointer-events-none"
                          style={filled ? blockStyle(piece.color) : { backgroundColor: 'transparent' }}
                        />
                      ))
                    )}
                  </div>
                </motion.div>
              </div>
            )
          })}
        </div>}

        {/* Instructions */}
        {canPlay && !gameOver && (
          <p className={`text-xs text-center max-w-xs ${isDark ? 'text-white/20' : 'text-black/20'}`}>
            Drag a piece onto the grid to place it.
            Complete rows or columns to score points.
          </p>
        )}
      </motion.div>

      {/* Floating drag ghost */}
      {dragging && draggedPiece && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: dragging.pos.x - (draggedPiece.shape[0].length * (CELL_SIZE + CELL_GAP)) / 2,
            top: dragging.pos.y - 60 - (draggedPiece.shape.length * (CELL_SIZE + CELL_GAP)) / 2,
          }}
        >
          <div
            className="grid gap-[2px]"
            style={{
              gridTemplateColumns: `repeat(${draggedPiece.shape[0].length}, ${CELL_SIZE}px)`,
              gridTemplateRows: `repeat(${draggedPiece.shape.length}, ${CELL_SIZE}px)`,
              filter: `drop-shadow(0 0 16px ${(COLOR_VARIANTS[draggedPiece.color]?.dark ?? draggedPiece.color)}40)`,
            }}
          >
            {draggedPiece.shape.map((row, r) =>
              row.map((filled, c) => (
                <div
                  key={`${r}-${c}`}
                  className="rounded-lg"
                  style={filled ? blockStyle(draggedPiece.color, 'ghost') : { backgroundColor: 'transparent' }}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Leaderboard section */}
      {!embedded && <motion.div
        ref={leaderboardRef}
        initial={{ opacity: 0, y: 40 }}
        animate={leaderboardInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.15 }}
        className="relative z-10 w-full max-w-sm mt-24 mb-10"
      >
        <div className={`rounded-2xl border backdrop-blur-sm p-6 transition-colors duration-500 ${
          isDark ? 'border-white/[0.08] bg-white/[0.03]' : 'border-black/[0.08] bg-black/[0.03]'
        }`}>
          <div className="flex items-center justify-center mb-5">
            <h3 className={`text-sm font-semibold uppercase tracking-widest text-center ${isDark ? 'text-white/50' : 'text-black/50'}`}>Leaderboard</h3>
          </div>
          {leaderboard.length === 0 ? (
            <p className={`text-sm text-center py-8 ${isDark ? 'text-white/20' : 'text-black/20'}`}>No scores yet. Be the first!</p>
          ) : (
            <div className="space-y-1">
              {leaderboard.slice(0, 10).map((entry, i) => (
                <div
                  key={`${entry.name}-${entry.score}-${i}`}
                  className={`flex items-center justify-between py-2 px-3 rounded-xl transition-colors ${
                    i === 0 ? 'bg-yellow-400/10' : i === 1 ? (isDark ? 'bg-white/[0.04]' : 'bg-black/[0.04]') : i === 2 ? 'bg-orange-400/5' : (isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-black/[0.02]')
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold w-6 text-right tabular-nums ${
                      i === 0 ? 'text-yellow-400' : i === 1 ? (isDark ? 'text-white/50' : 'text-black/50') : i === 2 ? 'text-orange-400' : (isDark ? 'text-white/20' : 'text-black/20')
                    }`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                    </span>
                    <span className={`text-sm truncate max-w-[140px] ${isDark ? 'text-white/80' : 'text-black/80'}`}>{entry.name}</span>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${isDark ? 'text-white' : 'text-black'}`}>{entry.score.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>}
    </div>
  )
}
