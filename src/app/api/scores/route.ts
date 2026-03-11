import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

type Score = {
  name: string
  email?: string
  score: number
  date: string
  joinedWaitingList?: boolean
}

const SCORES_FILE = path.join(process.cwd(), 'data', 'scores.json')
const MAX_SCORES = 50

function readScores(): Score[] {
  try {
    const data = fs.readFileSync(SCORES_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

function writeScores(scores: Score[]) {
  fs.writeFileSync(SCORES_FILE, JSON.stringify(scores, null, 2))
}

export async function GET() {
  const scores = readScores()
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
  // Don't expose emails to the client
  const safeScores = scores.map(({ name, score, date }) => ({ name, score, date }))
  return NextResponse.json(safeScores)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, email, score, joinWaitingList } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 20) {
    return NextResponse.json({ error: 'Nome non valido' }, { status: 400 })
  }
  if (typeof score !== 'number' || score < 0 || score > 999999) {
    return NextResponse.json({ error: 'Punteggio non valido' }, { status: 400 })
  }
  if (email && (typeof email !== 'string' || !email.includes('@'))) {
    return NextResponse.json({ error: 'Email non valida' }, { status: 400 })
  }

  const scores = readScores()
  scores.push({
    name: name.trim(),
    email: email?.trim() || undefined,
    score,
    date: new Date().toISOString(),
    joinedWaitingList: !!joinWaitingList,
  })

  scores.sort((a, b) => b.score - a.score)
  writeScores(scores.slice(0, MAX_SCORES))

  return NextResponse.json({ ok: true })
}
