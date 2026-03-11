import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.trim()
  const email = req.nextUrl.searchParams.get('email')?.trim()

  if (!name) {
    return NextResponse.json({ error: 'Missing name' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('scores')
    .select('name, email')
    .ilike('name', name)
    .limit(1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Name is available if no one has it, or if it belongs to the same email
  const taken = data && data.length > 0 && (!email || data[0].email?.trim() !== email)

  return NextResponse.json({ taken: !!taken })
}
