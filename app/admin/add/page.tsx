'use client'

import { ChangeEvent, ClipboardEvent, FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { ItemCategory, ItemStore } from '@/types/item'

const categories: ItemCategory[] = [
  'Stationery',
  'Mugs & Drinkware',
  'Plush & Figures',
  'Kitchen',
  'Baby & Nursery',
  'Home Decor',
  'Other',
]

const stores: ItemStore[] = ['Marshalls', 'TJ Maxx', 'HomeGoods', 'Other']
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp']

export default function AddItemPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ItemCategory>('Stationery')
  const [store, setStore] = useState<ItemStore>('Other')
  const [quantity, setQuantity] = useState('1')
  const [notes, setNotes] = useState('')
  const [uploadedImageUrl, setUploadedImageUrl] = useState('')
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [importedImageUrl, setImportedImageUrl] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [isImportingImage, setIsImportingImage] = useState(false)
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
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : 'Upload failed.',
      )
      setUploadedImageUrl('')
    } finally {
      setIsUploading(false)
    }
  }

  async function importImageFromUrl(url: string) {
    const trimmedUrl = url.trim()
    if (!trimmedUrl || trimmedUrl === importedImageUrl) return

    setError('')
    setIsImportingImage(true)

    try {
      const response = await fetch('/api/fetch-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: trimmedUrl }),
      })
      const data = (await response.json()) as { url?: string }

      if (!response.ok || !data.url) {
        throw new Error('Could not load this image, try another URL')
      }

      setImportedImageUrl(data.url)
      setImageUrlInput(data.url)
    } catch {
      setImportedImageUrl('')
      setError('Could not load this image, try another URL')
    } finally {
      setIsImportingImage(false)
    }
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) handleImageUpload(file)
    event.target.value = ''
  }

  function handleImageUrlPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pastedUrl = event.clipboardData.getData('text').trim()
    if (!pastedUrl) return

    event.preventDefault()
    setImageUrlInput(pastedUrl)
    importImageFromUrl(pastedUrl)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    const { error: insertError } = await supabase.from('items').insert({
      name: name.trim(),
      category,
      store,
      quantity: Number(quantity) || 1,
      notes: notes.trim() || null,
      image_url: uploadedImageUrl || importedImageUrl || null,
    })

    setIsSubmitting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    router.push('/')
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-zinc-950">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-3xl font-semibold">Add Item</h1>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <label className="block space-y-2">
            <span className="text-sm font-medium">Name</span>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-950"
              type="text"
            />
          </label>

          <div className="grid gap-6 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium">Category</span>
              <select
                required
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as ItemCategory)
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-950"
              >
                {categories.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium">Store</span>
              <select
                value={store}
                onChange={(event) => setStore(event.target.value as ItemStore)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-950"
              >
                {stores.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Quantity</span>
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-950"
              min="1"
              type="number"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-28 w-full rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-950"
            />
          </label>

          <div className="space-y-2">
            <span className="text-sm font-medium">Image</span>
            <label
              className="flex min-h-64 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 p-4 text-center transition hover:border-zinc-400"
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onDragEnter={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const file = e.dataTransfer.files?.[0]
                if (
                  file &&
                  ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
                ) {
                  handleImageUpload(file)
                }
              }}
            >
              <input
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleImageChange}
                type="file"
              />
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Selected item preview"
                  className="max-h-60 max-w-full rounded-md object-contain"
                />
              ) : (
                <div>
                  <div className="text-4xl">+</div>
                  <p className="mt-2 text-sm font-medium text-zinc-700">
                    Click to upload an image
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    JPG, PNG, or WEBP
                  </p>
                </div>
              )}
            </label>
            {isUploading && (
              <p className="text-sm text-zinc-500">Uploading image...</p>
            )}
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Or paste image URL</span>
            <div className="flex items-center gap-3">
              <input
                value={imageUrlInput}
                onBlur={() => importImageFromUrl(imageUrlInput)}
                onChange={(event) => setImageUrlInput(event.target.value)}
                onPaste={handleImageUrlPaste}
                className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-950"
                placeholder="https://..."
                type="url"
              />
              {importedImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={importedImageUrl}
                  alt="Imported image preview"
                  className="h-16 w-16 rounded-md border border-zinc-200 object-cover"
                />
              )}
            </div>
            {isImportingImage && (
              <p className="text-sm text-zinc-500">Importing image...</p>
            )}
          </label>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isUploading || isImportingImage}
            className="rounded-md bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {isSubmitting ? 'Adding...' : 'Add Item'}
          </button>
        </form>
      </div>
    </main>
  )
}
