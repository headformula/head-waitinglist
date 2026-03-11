import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const COOLDOWN_MS = 24 * 60 * 60 * 1000 // 24 hours

export async function GET() {
  // Fetch all scores ordered by score desc
  const { data, error } = await supabase
    .from('scores')
    .select('name, email, score, created_at')
    .order('score', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Deduplicate: keep only the best score per email (or per name if no email)
  const seen = new Set<string>()
  const unique: { name: string; score: number; date: string }[] = []

  for (const row of data ?? []) {
    const key = row.email?.trim() || `name:${row.name}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push({ name: row.name, score: row.score, date: row.created_at })
  }

  return NextResponse.json(unique.slice(0, 20))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, email, score, joinWaitingList } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 20) {
    return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
  }
  if (typeof score !== 'number' || score < 0 || score > 999999) {
    return NextResponse.json({ error: 'Invalid score' }, { status: 400 })
  }
  if (email && (typeof email !== 'string' || !email.includes('@'))) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  const trimmedEmail = email?.trim() || null
  const trimmedName = name.trim().toLowerCase()

  // Check if name is already taken by a different email
  const { data: existingName } = await supabase
    .from('scores')
    .select('email')
    .ilike('name', trimmedName)
    .limit(1)

  if (existingName && existingName.length > 0) {
    const existingEmail = existingName[0].email?.trim()
    if (existingEmail && existingEmail !== trimmedEmail) {
      return NextResponse.json({ error: 'Name already taken' }, { status: 409 })
    }
  }

  // Server-side cooldown check: block if this email played in the last 24h
  if (trimmedEmail) {
    const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS).toISOString()
    const { data: recentScores } = await supabase
      .from('scores')
      .select('id, created_at')
      .eq('email', trimmedEmail)
      .gte('created_at', cooldownCutoff)
      .limit(1)

    if (recentScores && recentScores.length > 0) {
      const lastPlayedAt = new Date(recentScores[0].created_at).getTime()
      const cooldownEnd = lastPlayedAt + COOLDOWN_MS

      // Check if follow-play was used after this score
      const { data: followPlay } = await supabase
        .from('follow_plays')
        .select('created_at')
        .eq('email', trimmedEmail)
        .gte('created_at', recentScores[0].created_at)
        .limit(1)

      if (!followPlay || followPlay.length === 0) {
        return NextResponse.json(
          { error: 'You already played in the last 24 hours', cooldownEnd },
          { status: 429 }
        )
      }
    }
  }

  const { error: scoreError } = await supabase.from('scores').insert({
    name: name.trim(),
    email: trimmedEmail,
    score,
    joined_waiting_list: !!joinWaitingList,
  })

  if (scoreError) return NextResponse.json({ error: scoreError.message }, { status: 500 })

  // Also add to waiting list if requested
  if (joinWaitingList && trimmedEmail) {
    await supabase.from('waiting_list').upsert(
      { email: trimmedEmail },
      { onConflict: 'email' }
    )
  }

  return NextResponse.json({ ok: true })
}
