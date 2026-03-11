'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import { useTheme } from './ThemeProvider'

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

type BlockBlastProps = {
  userEmail?: string
  isOnWaitingList?: boolean
}

export function BlockBlastGame({ userEmail = '', isOnWaitingList = false }: BlockBlastProps) {
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


  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [playerName, setPlayerName] = useState('')
  const [playerEmail, setPlayerEmail] = useState('')
  const [joinWaitingList, setJoinWaitingList] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Pre-fill email from waiting list
  useEffect(() => {
    if (userEmail) setPlayerEmail(userEmail)
  }, [userEmail])
  const leaderboardRef = useRef<HTMLDivElement>(null)
  const leaderboardInView = useInView(leaderboardRef, { amount: 0.2 })

  const draggedPiece = dragging ? pieces[dragging.pieceIndex] : null

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
      if (!anyCanPlace) setGameOver(true)
    }
  }, [grid, pieces])

  // Convert pointer position to grid cell
  const pointerToCell = useCallback((clientX: number, clientY: number): { row: number; col: number } | null => {
    if (!gridRef.current) return null
    const rect = gridRef.current.getBoundingClientRect()
    const x = clientX - rect.left - GRID_PAD
    const y = clientY - rect.top - GRID_PAD
    const col = Math.floor(x / (CELL_SIZE + CELL_GAP))
    const row = Math.floor(y / (CELL_SIZE + CELL_GAP))
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null
    return { row, col }
  }, [])

  // Pointer handlers
  const handlePointerDown = useCallback((index: number, e: React.PointerEvent) => {
    if (gameOver) return
    e.preventDefault()
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
    const cell = pointerToCell(
      e.clientX - Math.floor(piece.shape[0].length / 2) * (CELL_SIZE + CELL_GAP),
      e.clientY + offsetY - Math.floor(piece.shape.length / 2) * (CELL_SIZE + CELL_GAP)
    )
    setDropTarget(cell)
  }, [dragging, pieces, pointerToCell])

  const handlePointerUp = useCallback(() => {
    if (!dragging || !draggedPiece) {
      setDragging(null)
      setDropTarget(null)
      return
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
      if (toClear.size > 0) {
        const newCombo = combo + 1
        setCombo(newCombo)
        points += toClear.size * 10 * newCombo
        setClearing(toClear)
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
    if (joinWaitingList && !isOnWaitingList && !playerEmail.trim()) return
    setSubmitting(true)
    try {
      await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: playerName.trim(),
          email: playerEmail.trim(),
          score,
          joinWaitingList: !isOnWaitingList && joinWaitingList,
        }),
      })
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
    setPlayerName('')
    setPlayerEmail(userEmail)
    setJoinWaitingList(true)
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
      className={`min-h-screen flex flex-col items-center justify-center px-4 py-20 relative select-none transition-colors duration-500 ${isDark ? 'bg-black' : 'bg-white'}`}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { setDragging(null); setDropTarget(null) }}
      style={{ touchAction: dragging ? 'none' : 'auto' }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(99,102,241,0.08)_0%,_transparent_70%)]" />

      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 60 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative z-10 flex flex-col items-center gap-8"
      >
        {/* Title */}
        <div className="text-center">
          <p className={`text-3xl font-light transition-colors duration-500 ${isDark ? 'text-white/60' : 'text-black/60'}`}>Mentre aspetti, gioca un po&apos;</p>
        </div>

        {/* Score */}
        <div className="flex items-center gap-6">
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
        </div>

        {/* Grid */}
        <div
          ref={gridRef}
          className={`relative rounded-2xl p-2 backdrop-blur-sm transition-colors duration-500 ${
            isDark ? 'bg-white/[0.03] border border-white/[0.06]' : 'bg-black/[0.03] border border-black/[0.06]'
          }`}
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
                        ? { backgroundColor: '#fff' }
                        : isPreview && draggedPiece
                          ? blockStyle(draggedPiece.color, 'preview')
                          : cell
                            ? blockStyle(cell)
                            : undefined
                    }
                    animate={
                      isClearing
                        ? { scale: [1, 1.2, 0], opacity: [1, 1, 0] }
                        : { scale: 1, opacity: 1 }
                    }
                    transition={
                      isClearing
                        ? { duration: 0.4, ease: 'easeOut' }
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
                  {!submitted ? (
                    <form onSubmit={(e) => { e.preventDefault(); submitScore() }} className="space-y-2.5">
                      <input
                        type="text"
                        placeholder="Il tuo nome"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value.slice(0, 20))}
                        className={`w-full rounded-full py-2.5 px-4 focus:outline-none text-center text-[16px] ${
                          isDark
                            ? 'text-white bg-white/10 border border-white/15 focus:border-white/30 placeholder:text-white/25'
                            : 'text-black bg-black/10 border border-black/15 focus:border-black/30 placeholder:text-black/25'
                        }`}
                        autoFocus
                        maxLength={20}
                      />
                      {!isOnWaitingList && joinWaitingList && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <input
                            type="email"
                            placeholder="la-tua@email.com"
                            value={playerEmail}
                            onChange={(e) => setPlayerEmail(e.target.value)}
                            className={`w-full rounded-full py-2.5 px-4 focus:outline-none text-center text-[16px] ${
                              isDark
                                ? 'text-white bg-white/10 border border-white/15 focus:border-white/30 placeholder:text-white/25'
                                : 'text-black bg-black/10 border border-black/15 focus:border-black/30 placeholder:text-black/25'
                            }`}
                          />
                        </motion.div>
                      )}
                      {!isOnWaitingList && (
                        <label className="flex items-center justify-center gap-2 cursor-pointer py-1">
                          <div
                            onClick={(e) => { e.preventDefault(); setJoinWaitingList(!joinWaitingList) }}
                            className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                              joinWaitingList
                                ? 'bg-white border-white'
                                : isDark
                                  ? 'border-white/20 bg-transparent'
                                  : 'border-black/20 bg-transparent'
                            }`}
                          >
                            {joinWaitingList && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 20 20" fill="black">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          <span className={`text-xs ${isDark ? 'text-white/40' : 'text-black/40'}`}>Unisciti alla waiting list</span>
                        </label>
                      )}
                      {isOnWaitingList && (
                        <p className={`text-xs flex items-center justify-center gap-1 ${isDark ? 'text-white/30' : 'text-black/30'}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="text-green-400/60">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Sei già nella waiting list
                        </p>
                      )}
                      <motion.button
                        type="submit"
                        disabled={!playerName.trim() || (joinWaitingList && !isOnWaitingList && !playerEmail.trim()) || submitting}
                        className={`w-full rounded-full font-medium py-2.5 text-sm transition-all duration-300 ${
                          playerName.trim() && (!joinWaitingList || isOnWaitingList || playerEmail.trim())
                            ? isDark
                              ? 'bg-white text-black hover:bg-white/90 cursor-pointer'
                              : 'bg-black text-white hover:bg-black/90 cursor-pointer'
                            : isDark
                              ? 'bg-white/10 text-white/30 cursor-not-allowed'
                              : 'bg-black/10 text-black/30 cursor-not-allowed'
                        }`}
                        whileHover={playerName.trim() && (!joinWaitingList || isOnWaitingList || playerEmail.trim()) ? { scale: 1.02 } : {}}
                        whileTap={playerName.trim() && (!joinWaitingList || isOnWaitingList || playerEmail.trim()) ? { scale: 0.98 } : {}}
                      >
                        {submitting ? 'Salvo...' : 'Salva punteggio'}
                      </motion.button>
                    </form>
                  ) : (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
                      <p className={`text-xs ${isDark ? 'text-white/40' : 'text-black/40'}`}>
                        {rank <= 3 ? 'Sei sul podio!' : `Posizione #${rank}`}
                      </p>
                      {!isOnWaitingList && joinWaitingList && (
                        <p className="text-green-400/50 text-xs">Aggiunto alla waiting list!</p>
                      )}
                    </motion.div>
                  )}
                  <motion.button
                    onClick={resetGame}
                    className={`transition-colors text-xs cursor-pointer underline underline-offset-2 ${isDark ? 'text-white/40 hover:text-white/70' : 'text-black/40 hover:text-black/70'}`}
                    whileTap={{ scale: 0.95 }}
                  >
                    Gioca ancora
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Pieces tray */}
        <div
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
        </div>

        {/* Instructions */}
        {!gameOver && (
          <p className={`text-xs text-center max-w-xs ${isDark ? 'text-white/20' : 'text-black/20'}`}>
            Trascina un pezzo sulla griglia per posizionarlo.
            Completa righe o colonne per fare punti.
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
      <motion.div
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
            <h3 className={`text-sm font-semibold uppercase tracking-widest text-center ${isDark ? 'text-white/50' : 'text-black/50'}`}>Classifica</h3>
          </div>
          {leaderboard.length === 0 ? (
            <p className={`text-sm text-center py-8 ${isDark ? 'text-white/20' : 'text-black/20'}`}>Nessun punteggio ancora. Gioca per primo!</p>
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
      </motion.div>
    </div>
  )
}
