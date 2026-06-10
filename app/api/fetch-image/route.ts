import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

let supabaseClient: ReturnType<typeof createClient> | null = null

function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }

  return supabaseClient
}

export async function POST(request: NextRequest) {
  const { imageUrl } = await request.json()
  if (!imageUrl) return NextResponse.json({ error: 'No URL' }, { status: 400 })

  try {
    const response = await fetch(imageUrl)
    if (!response.ok) throw new Error('Failed to fetch image')

    const buffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const ext = contentType.includes('png')
      ? 'png'
      : contentType.includes('webp')
        ? 'webp'
        : 'jpg'
    const filename = `url-import-${Date.now()}.${ext}`

    const supabase = getSupabase()
    const { error } = await supabase.storage
      .from('item-images')
      .upload(filename, buffer, { contentType })

    if (error) throw error

    const { data: publicData } = supabase.storage
      .from('item-images')
      .getPublicUrl(filename)

    return NextResponse.json({ url: publicData.publicUrl })
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch image' },
      { status: 500 },
    )
  }
}
