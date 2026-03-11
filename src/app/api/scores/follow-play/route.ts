import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const COOLDOWN_MS = 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  const trimmedEmail = email?.trim()
  if (!trimmedEmail) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }

  // Check user is actually in cooldown
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS).toISOString()
  const { data: recentScores } = await supabase
    .from('scores')
    .select('created_at')
    .eq('email', trimmedEmail)
    .gte('created_at', cooldownCutoff)
    .order('created_at', { ascending: false })
    .limit(1)

  if (!recentScores || recentScores.length === 0) {
    return NextResponse.json({ error: 'Not in cooldown' }, { status: 400 })
  }

  const lastPlayedAt = new Date(recentScores[0].created_at).getTime()

  // Check if follow-play was already used for this cooldown period
  const { data: existingFollowPlay } = await supabase
    .from('follow_plays')
    .select('created_at')
    .eq('email', trimmedEmail)
    .gte('created_at', new Date(lastPlayedAt).toISOString())
    .limit(1)

  if (existingFollowPlay && existingFollowPlay.length > 0) {
    return NextResponse.json({ error: 'Already used for this cooldown' }, { status: 429 })
  }

  // Grant follow-play
  const { error: insertError } = await supabase
    .from('follow_plays')
    .insert({ email: trimmedEmail })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
