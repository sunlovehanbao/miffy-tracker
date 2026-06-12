'use client'

import Link from 'next/link'
import {
  type CSSProperties,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { supabase } from '@/lib/supabase'
import type { Item, ItemCategory, ItemStore } from '@/types/item'

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

interface EditForm {
  name: string
  category: ItemCategory
  store: ItemStore
  quantity: string
  notes: string
  imageUrl: string
  imageUrlInput: string
  previewUrl: string
}

const emptyEditForm: EditForm = {
  name: '',
  category: 'Stationery',
  store: 'Other',
  quantity: '1',
  notes: '',
  imageUrl: '',
  imageUrlInput: '',
  previewUrl: '',
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm)
  const [expandedRect, setExpandedRect] = useState<DOMRect | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isImportingImage, setIsImportingImage] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function loadItems() {
      setIsLoading(true)
      setError('')

      const { data, error: fetchError } = await supabase
        .from('items')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setItems((data || []) as Item[])
      }

      setIsLoading(false)
    }

    loadItems()
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeExpandedCard()
    }

    if (editingItem) window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
    // closeExpandedCard reads the active form state when Escape is pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingItem])

  useEffect(() => {
    return () => {
      if (editForm.previewUrl) URL.revokeObjectURL(editForm.previewUrl)
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [editForm.previewUrl])

  const editImageUrl = editForm.previewUrl || editForm.imageUrl

  function updateEditForm(fields: Partial<EditForm>) {
    setEditForm((currentForm) => ({ ...currentForm, ...fields }))
  }

  function getFormFromItem(item: Item): EditForm {
    return {
      name: item.name || '',
      category: item.category || 'Stationery',
      store: item.store || 'Other',
      quantity: String(item.quantity || 1),
      notes: item.notes || '',
      imageUrl: item.image_url || '',
      imageUrlInput: item.image_url || '',
      previewUrl: '',
    }
  }

  function openExpandedCard(item: Item, target: HTMLElement) {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    if (editForm.previewUrl) URL.revokeObjectURL(editForm.previewUrl)

    setError('')
    setEditingItem(item)
    setEditForm(getFormFromItem(item))
    setExpandedRect(target.getBoundingClientRect())
    setIsExpanded(false)
    requestAnimationFrame(() => setIsExpanded(true))
  }

  function closeExpandedCard() {
    if (!editingItem) return

    setIsExpanded(false)
    closeTimer.current = setTimeout(() => {
      if (editForm.previewUrl) URL.revokeObjectURL(editForm.previewUrl)
      setEditingItem(null)
      setEditForm(emptyEditForm)
      setExpandedRect(null)
      setError('')
      setIsUploading(false)
      setIsImportingImage(false)
      setIsSaving(false)
    }, 300)
  }

  function getExpandedCardStyle(): CSSProperties {
    if (!expandedRect) return {}

    return {
      height: isExpanded
        ? 'min(600px, calc(100vh - 32px))'
        : expandedRect.height,
      left: isExpanded ? '50%' : expandedRect.left,
      top: isExpanded ? '50%' : expandedRect.top,
      transform: isExpanded ? 'translate(-50%, -50%)' : 'translate(0, 0)',
      width: isExpanded
        ? 'min(360px, calc(100vw - 32px))'
        : expandedRect.width,
    }
  }

  async function handleImageUpload(file: File) {
    setError('')
    setIsUploading(true)

    try {
      if (!allowedImageTypes.includes(file.type)) {
        throw new Error('Please upload a JPG, PNG, or WEBP image.')
      }

      if (editForm.previewUrl) URL.revokeObjectURL(editForm.previewUrl)
      const previewUrl = URL.createObjectURL(file)

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

      updateEditForm({
        imageUrl: data.publicUrl,
        imageUrlInput: data.publicUrl,
        previewUrl,
      })
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : 'Upload failed.',
      )
    } finally {
      setIsUploading(false)
    }
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) handleImageUpload(file)
    event.target.value = ''
  }

  async function importImageFromUrl(url: string) {
    const trimmedUrl = url.trim()
    if (!trimmedUrl || trimmedUrl === editForm.imageUrl) return

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

      if (editForm.previewUrl) URL.revokeObjectURL(editForm.previewUrl)
      updateEditForm({
        imageUrl: data.url,
        imageUrlInput: data.url,
        previewUrl: '',
      })
    } catch {
      setError('Could not load this image, try another URL')
    } finally {
      setIsImportingImage(false)
    }
  }

  function handleImageUrlPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pastedUrl = event.clipboardData.getData('text').trim()
    if (!pastedUrl) return

    event.preventDefault()
    updateEditForm({ imageUrlInput: pastedUrl })
    importImageFromUrl(pastedUrl)
  }

  async function handleSaveChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingItem) return

    setError('')
    setIsSaving(true)

    const updatedItem: Partial<Item> = {
      name: editForm.name.trim(),
      category: editForm.category,
      store: editForm.store,
      quantity: Number(editForm.quantity) || 1,
      notes: editForm.notes.trim() || undefined,
      image_url: editForm.imageUrl || undefined,
    }

    const { data, error: updateError } = await supabase
      .from('items')
      .update({
        ...updatedItem,
        notes: updatedItem.notes || null,
        image_url: updatedItem.image_url || null,
      })
      .eq('id', editingItem.id)
      .select('*')
      .single()

    setIsSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    const savedItem = data as Item
    setItems((currentItems) =>
      currentItems.map((item) => (item.id === savedItem.id ? savedItem : item)),
    )
    closeExpandedCard()
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-zinc-950">
      <div className="mx-auto min-h-screen w-full max-w-[390px] bg-white px-4 py-5">
        {error && !editingItem && (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {isLoading ? (
          <p className="mt-10 text-center text-sm text-zinc-500">
            Loading collection...
          </p>
        ) : items.length === 0 ? (
          <div className="mt-10 rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
            <div className="text-5xl">🐰</div>
            <p className="mt-4 text-lg font-medium">No items found</p>
          </div>
        ) : (
          <section className="flex flex-col items-center gap-4">
            {items.map((item) => (
              <article
                key={item.id}
                onClick={(event) => openExpandedCard(item, event.currentTarget)}
                className="group h-auto w-[340px] cursor-pointer rounded-[16px] border-2 border-[#FFD6E0] bg-white p-3 shadow-[0_4px_12px_rgba(255,183,197,0.3)] transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-[0_10px_24px_rgba(255,183,197,0.45)] active:scale-105 active:shadow-[0_10px_24px_rgba(255,183,197,0.45)]"
              >
                <div className="flex flex-col gap-3 bg-white">
                  <div className="flex h-[320px] w-full items-center justify-center overflow-hidden rounded-[12px] border-2 border-[#FFD6E0] bg-rose-50">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-6xl">🐰</span>
                    )}
                  </div>

                  <div className="min-h-[80px] rounded-[12px] border-2 border-[#FFD6E0] bg-[#FFF5F7] px-3 py-2.5 text-center">
                    <h2 className="line-clamp-2 text-lg font-bold leading-tight text-[#FF85A1]">
                      {item.name}
                    </h2>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-[#FF85A1]">
                      <span>Qty {item.quantity}</span>
                      <span className="truncate">{item.category}</span>
                    </div>
                    <div className="mt-2 overflow-hidden text-xs leading-5 text-zinc-500">
                      {item.notes ? (
                        <p className="line-clamp-4">{item.notes}</p>
                      ) : (
                        <p className="text-zinc-400">No notes</p>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      {editingItem && (
        <div
          className={`fixed inset-0 z-50 bg-black/60 p-4 transition-opacity duration-300 ease-out ${
            isExpanded ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={closeExpandedCard}
        >
          <form
            onSubmit={handleSaveChanges}
            className="fixed overflow-hidden rounded-[20px] border-[3px] border-[#FFD6E0] bg-white shadow-[0_30px_90px_rgba(255,150,180,0.45)] transition-all duration-300 ease-out"
            style={getExpandedCardStyle()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-full flex-col">
              <div className="relative basis-[60%] border-b border-[#FFD6E0] bg-rose-50">
                <label
                  className="flex h-full cursor-pointer items-center justify-center overflow-hidden"
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
                  {editImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={editImageUrl}
                      alt="Selected item preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-center">
                      <div className="text-5xl">🐰</div>
                      <p className="mt-2 text-sm font-medium text-zinc-700">
                        Click to upload an image
                      </p>
                    </div>
                  )}
                </label>

                <div className="absolute inset-x-3 bottom-3 rounded-md bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
                  <input
                    value={editForm.imageUrlInput}
                    onBlur={() => importImageFromUrl(editForm.imageUrlInput)}
                    onChange={(event) =>
                      updateEditForm({ imageUrlInput: event.target.value })
                    }
                    onPaste={handleImageUrlPaste}
                    className="h-8 w-full border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-sm outline-none"
                    placeholder="Paste image URL"
                    type="url"
                  />
                  {(isUploading || isImportingImage) && (
                    <p className="mt-1 text-xs text-zinc-500">
                      {isUploading ? 'Uploading image...' : 'Importing image...'}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex min-h-0 basis-[40%] flex-col bg-white">
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
                  <input
                    required
                    value={editForm.name}
                    onChange={(event) =>
                      updateEditForm({ name: event.target.value })
                    }
                    className="h-8 w-full border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-base font-semibold outline-none"
                    placeholder="Name"
                    type="text"
                  />

                  <select
                    required
                    value={editForm.category}
                    onChange={(event) =>
                      updateEditForm({
                        category: event.target.value as ItemCategory,
                      })
                    }
                    className="h-8 w-full border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-sm outline-none"
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>

                  <select
                    value={editForm.store}
                    onChange={(event) =>
                      updateEditForm({ store: event.target.value as ItemStore })
                    }
                    className="h-8 w-full border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-sm outline-none"
                  >
                    {stores.map((store) => (
                      <option key={store} value={store}>
                        {store}
                      </option>
                    ))}
                  </select>

                  <input
                    value={editForm.quantity}
                    onChange={(event) =>
                      updateEditForm({ quantity: event.target.value })
                    }
                    className="h-8 w-full border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-sm outline-none"
                    min="1"
                    placeholder="Quantity"
                    type="number"
                  />

                  <textarea
                    value={editForm.notes}
                    onChange={(event) =>
                      updateEditForm({ notes: event.target.value })
                    }
                    className="h-14 w-full resize-none border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-sm outline-none"
                    placeholder="Notes"
                  />

                  {error && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {error}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-[#FFD6E0] px-5 py-3">
                  <button
                    type="submit"
                    disabled={isSaving || isUploading || isImportingImage}
                    className="min-h-11 rounded-md bg-[#FF8FB3] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={closeExpandedCard}
                    className="min-h-11 rounded-md border border-[#FFD6E0] bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-rose-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      <Link
        href="/admin/add"
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-3xl font-light text-white shadow-lg transition hover:bg-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-200"
        aria-label="Add new item"
      >
        +
      </Link>
    </main>
  )
}
