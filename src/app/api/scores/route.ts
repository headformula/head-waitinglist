import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('scores')
    .select('name, score, created_at')
    .order('score', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const safeScores = (data ?? []).map(({ name, score, created_at }) => ({
    name,
    score,
    date: created_at,
  }))

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

  const { error: scoreError } = await supabase.from('scores').insert({
    name: name.trim(),
    email: email?.trim() || null,
    score,
    joined_waiting_list: !!joinWaitingList,
  })

  if (scoreError) return NextResponse.json({ error: scoreError.message }, { status: 500 })

  // Also add to waiting list if requested
  if (joinWaitingList && email?.trim()) {
    await supabase.from('waiting_list').upsert(
      { email: email.trim() },
      { onConflict: 'email' }
    )
  }

  return NextResponse.json({ ok: true })
}
