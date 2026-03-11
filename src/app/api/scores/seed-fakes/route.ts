import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Pool of realistic-looking names
const FAKE_NAMES = [
  'alex', 'marco', 'sofia', 'luna', 'kai', 'mia', 'leo', 'zara',
  'nico', 'emma', 'liam', 'aria', 'noah', 'maya', 'ethan', 'ivy',
  'omar', 'chloe', 'ravi', 'yuki', 'finn', 'nora', 'sam', 'jade',
  'max', 'vera', 'dani', 'iris', 'joel', 'tara', 'eli', 'rosa',
  'seb', 'lina', 'jay', 'kira', 'tom', 'nadia', 'luke', 'ava',
  'dex', 'mila', 'ace', 'lily', 'rex', 'ella', 'zeke', 'nina',
  'ryu', 'olga', 'gus', 'bea', 'axel', 'faye', 'hugo', 'dina',
  'ivan', 'cleo', 'vito', 'sage', 'kane', 'wren', 'juno', 'ash',
]

// Suffixes to make names more unique (gaming style)
const SUFFIXES = [
  '', '', '', '', // Most names have no suffix
  '_x', '.eth', '99', '23', '01', '_gg', '.sol', '7', '_', '42',
  'btc', '.ai', '_pro', '00', '_dev', '11', 'xd', '_fn',
]

function randomName(): string {
  const name = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)]
  const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)]
  return `${name}${suffix}`
}

function randomScore(min: number, max: number): number {
  // Distribution that clusters scores more realistically (bias toward lower-mid range)
  const rand = Math.random() * Math.random()
  return Math.floor(min + rand * (max - min))
}

// How many fake users to add per cron run
const FAKES_PER_RUN = 2

async function seedFakes(count: number) {
  const numToCreate = Math.min(Math.max(1, count), 30)

  // Fetch current top scores to know the ceiling
  const { data: topScores, error: fetchError } = await supabase
    .from('scores')
    .select('name, email, score')
    .order('score', { ascending: false })
    .limit(50)

  if (fetchError) {
    return { error: fetchError.message }
  }

  // Deduplicate to find true rankings (same logic as GET)
  const seen = new Set<string>()
  const ranked: { name: string; score: number }[] = []
  for (const row of topScores ?? []) {
    const key = row.email?.trim() || `name:${row.name}`
    if (seen.has(key)) continue
    seen.add(key)
    ranked.push({ name: row.name, score: row.score })
  }

  // Ceiling: fake users must score below position #2
  let ceiling: number
  if (ranked.length >= 2) {
    ceiling = ranked[1].score - 1
  } else if (ranked.length === 1) {
    ceiling = ranked[0].score - 1
  } else {
    ceiling = 500
  }

  const floor = Math.max(50, Math.floor(ceiling * 0.15))

  if (ceiling <= floor) {
    return { error: 'Top scores are too low to insert fakes below them', ceiling, floor }
  }

  // Generate unique names (avoid collisions with existing leaderboard)
  const existingNames = new Set(ranked.map(r => r.name.toLowerCase()))
  const fakeEntries: { name: string; email: string; score: number }[] = []
  const usedNames = new Set<string>()

  let attempts = 0
  while (fakeEntries.length < numToCreate && attempts < numToCreate * 10) {
    attempts++
    const name = randomName()
    const nameLower = name.toLowerCase()
    if (existingNames.has(nameLower) || usedNames.has(nameLower)) continue
    usedNames.add(nameLower)

    const score = randomScore(floor, ceiling)
    fakeEntries.push({
      name,
      email: `fake+${nameLower}@headformula.bot`,
      score,
    })
  }

  const { error: insertError } = await supabase.from('scores').insert(
    fakeEntries.map(e => ({
      name: e.name,
      email: e.email,
      score: e.score,
      joined_waiting_list: false,
    }))
  )

  if (insertError) {
    return { error: insertError.message }
  }

  return {
    ok: true,
    created: fakeEntries.length,
    ceiling,
    floor,
    entries: fakeEntries.map(e => ({ name: e.name, score: e.score })),
  }
}

// ── GET: called by Vercel Cron ──────────────────────────────────────
export async function GET(req: NextRequest) {
  // Verify the request comes from Vercel Cron
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await seedFakes(FAKES_PER_RUN)
  if (result.error) {
    return NextResponse.json(result, { status: 400 })
  }
  return NextResponse.json(result)
}

// ── POST: manual trigger (protected by secret) ─────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { secret, count = 5 } = body

  if (secret !== process.env.SEED_FAKE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await seedFakes(count)
  if (result.error) {
    return NextResponse.json(result, { status: 400 })
  }
  return NextResponse.json(result)
}
