import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const COOLDOWN_MS = 24 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')?.trim()
  if (!email) {
    return NextResponse.json({ canPlay: true, cooldownEnd: null })
  }

  const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS).toISOString()
  const { data } = await supabase
    .from('scores')
    .select('created_at')
    .eq('email', email)
    .gte('created_at', cooldownCutoff)
    .order('created_at', { ascending: false })
    .limit(1)

  // Check if follow-play was ever used by this user
  const { data: anyFollowPlay } = await supabase
    .from('follow_plays')
    .select('created_at')
    .eq('email', email)
    .limit(1)

  const followPlayUsed = !!(anyFollowPlay && anyFollowPlay.length > 0)

  if (data && data.length > 0) {
    const lastPlayedAt = new Date(data[0].created_at).getTime()
    const cooldownEnd = lastPlayedAt + COOLDOWN_MS
    if (cooldownEnd > Date.now()) {
      // Check if follow-play was used after this score
      const { data: followPlay } = await supabase
        .from('follow_plays')
        .select('created_at')
        .eq('email', email)
        .gte('created_at', data[0].created_at)
        .limit(1)

      if (followPlay && followPlay.length > 0) {
        return NextResponse.json({ canPlay: true, cooldownEnd: null, followPlayUsed })
      }

      return NextResponse.json({ canPlay: false, cooldownEnd, followPlayUsed })
    }
  }

  return NextResponse.json({ canPlay: true, cooldownEnd: null, followPlayUsed })
}
