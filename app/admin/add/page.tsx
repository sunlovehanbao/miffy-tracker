'use client'

import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp']

export default function AddItemPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [notes, setNotes] = useState('')
  const [uploadedImageUrl, setUploadedImageUrl] = useState('')
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function handleImageUpload(file: File) {
    setError('')
    setIsUploading(true)

    try {
      if (!allowedImageTypes.includes(file.type)) {
        throw new Error('Please upload a JPG, PNG, or WEBP image.')
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(file))

      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const filePath = `${crypto.randomUUID()}.${extension}`

      const { error: uploadError } = await supabase.storage
        .from('item-images')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) throw new Error(uploadError.message)

      const { data } = supabase.storage
        .from('item-images')
        .getPublicUrl(filePath)

      setUploadedImageUrl(data.publicUrl)
      setImageUrlInput(data.publicUrl)
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : 'Upload failed.',
      )
      setUploadedImageUrl('')
    } finally {
      setIsUploading(false)
    }
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) handleImageUpload(file)
    event.target.value = ''
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    const { error: insertError } = await supabase.from('items').insert({
      name: name.trim(),
      category: 'Other',
      store: 'Other',
      quantity: Number(quantity) || 1,
      notes: notes.trim() || null,
      image_url: uploadedImageUrl || imageUrlInput.trim() || null,
    })

    setIsSubmitting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    router.push('/')
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] px-4 py-5 text-base text-zinc-950">
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-[390px] rounded-[16px] border-2 border-[#FFD6E0] bg-white p-3 shadow-[0_4px_12px_rgba(255,183,197,0.3)]"
      >
        <label
          className="flex h-[320px] cursor-pointer items-center justify-center overflow-hidden rounded-[12px] border-2 border-[#FFD6E0] bg-rose-50"
          onDragOver={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onDragEnter={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onDrop={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const file = event.dataTransfer.files?.[0]
            if (file && allowedImageTypes.includes(file.type)) {
              handleImageUpload(file)
            }
          }}
        >
          <input
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleImageChange}
            type="file"
          />
          {previewUrl || imageUrlInput ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl || imageUrlInput}
              alt="Selected item preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-7xl font-light text-[#FF8FB3]">+</span>
          )}
        </label>

        {isUploading && (
          <p className="mt-2 text-center text-sm text-zinc-500">
            Uploading image...
          </p>
        )}

        <div className="mt-3 rounded-[12px] border-2 border-[#FFD6E0] bg-[#FFF5F7]">
          <div className="space-y-4 px-4 py-4">
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-h-11 w-full border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-base font-semibold outline-none"
              placeholder="Name"
              type="text"
            />

            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="min-h-11 w-full border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-base outline-none"
              min="1"
              placeholder="Quantity"
              type="number"
            />

            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-28 w-full resize-none border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-base outline-none"
              placeholder="Notes"
            />

            <input
              value={imageUrlInput}
              onChange={(event) => setImageUrlInput(event.target.value)}
              className="min-h-11 w-full border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-base outline-none"
              placeholder="Image URL"
              type="url"
            />

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-[#FFD6E0] bg-white px-4 py-3">
            <button
              type="submit"
              disabled={isSubmitting || isUploading}
              className="min-h-11 rounded-md bg-[#FF8FB3] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isSubmitting ? 'Adding...' : 'Add Item'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="min-h-11 rounded-md border border-[#FFD6E0] bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-rose-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </main>
  )
}
