'use client'

import Link from 'next/link'
import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type TouchEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { supabase } from '@/lib/supabase'
import type { Item } from '@/types/item'

const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp']
const swipeThreshold = 50

interface EditForm {
  name: string
  quantity: string
  notes: string
  imageUrl: string
  previewUrl: string
}

const emptyEditForm: EditForm = {
  name: '',
  quantity: '1',
  notes: '',
  imageUrl: '',
  previewUrl: '',
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm)
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const touchStartX = useRef(0)

  const activeCardIndex =
    items.length > 0 ? Math.min(activeIndex, items.length - 1) : 0
  const editImageUrl = editForm.previewUrl || editForm.imageUrl

  async function loadItems(showLoading = false) {
    if (showLoading) setIsLoading(true)
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

    if (showLoading) setIsLoading(false)
  }

  useEffect(() => {
    loadItems(true)
    // loadItems only uses stable React state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeIndex > items.length - 1) {
      setActiveIndex(Math.max(items.length - 1, 0))
    }
  }, [activeIndex, items.length])

  useEffect(() => {
    return () => {
      if (editForm.previewUrl) URL.revokeObjectURL(editForm.previewUrl)
    }
  }, [editForm.previewUrl])

  function updateEditForm(fields: Partial<EditForm>) {
    setEditForm((currentForm) => ({ ...currentForm, ...fields }))
  }

  function getFormFromItem(item: Item): EditForm {
    return {
      name: item.name || '',
      quantity: String(item.quantity || 1),
      notes: item.notes || '',
      imageUrl: item.image_url || '',
      previewUrl: '',
    }
  }

  function openEditor(item: Item) {
    if (editForm.previewUrl) URL.revokeObjectURL(editForm.previewUrl)
    setError('')
    setExpandedId(item.id)
    setEditForm(getFormFromItem(item))
  }

  function closeEditor() {
    if (editForm.previewUrl) URL.revokeObjectURL(editForm.previewUrl)
    setExpandedId(null)
    setEditForm(emptyEditForm)
    setError('')
    setIsUploading(false)
    setIsSaving(false)
  }

  function getCardStyle(index: number): CSSProperties {
    const relativeIndex = index - activeCardIndex
    const isVisible = Math.abs(relativeIndex) <= 1

    return {
      opacity: isVisible ? 1 : 0,
      pointerEvents: isVisible ? 'auto' : 'none',
      transform: `translateX(calc(-50% + ${relativeIndex * 312}px))`,
      zIndex: 20 - Math.abs(relativeIndex),
    }
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    touchStartX.current = event.touches[0].clientX
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    if (expandedId) return

    const deltaX = event.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(deltaX) < swipeThreshold) return

    setActiveIndex((currentIndex) => {
      if (deltaX < 0) return Math.min(items.length - 1, currentIndex + 1)
      return Math.max(0, currentIndex - 1)
    })
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

  async function handleSaveChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!expandedId) return

    setError('')
    setIsSaving(true)

    const updates = {
      name: editForm.name.trim(),
      quantity: Number(editForm.quantity) || 1,
      notes: editForm.notes.trim() || null,
      image_url: editForm.imageUrl || null,
    }

    const { data, error: updateError } = await supabase
      .from('items')
      .update(updates)
      .eq('id', expandedId)
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
    closeEditor()
    await loadItems()
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-zinc-950">
      <div className="mx-auto min-h-screen w-full max-w-[390px] bg-white px-4 py-5">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
          <section
            className={`relative overflow-hidden transition-[min-height] duration-300 ease-out ${
              expandedId ? 'min-h-[760px]' : 'min-h-[560px]'
            }`}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {items.map((item, index) => {
              const isActive = index === activeCardIndex
              const isExpanded = expandedId === item.id
              const isSideCard = Math.abs(index - activeCardIndex) === 1

              return (
                <article
                  key={item.id}
                  className={`absolute left-1/2 top-6 w-[300px] overflow-hidden rounded-[16px] border-2 border-[#FFD6E0] bg-white p-3 shadow-[0_4px_12px_rgba(255,183,197,0.3)] transition-[transform,opacity,min-height,box-shadow] duration-300 ease-out ${
                    isActive ? 'cursor-pointer' : 'cursor-pointer'
                  } ${isExpanded ? 'min-h-[700px]' : 'min-h-[460px]'}`}
                  style={{
                    ...getCardStyle(index),
                    opacity: isExpanded
                      ? 1
                      : isSideCard
                        ? 0.6
                        : getCardStyle(index).opacity,
                  }}
                  onClick={() => {
                    if (expandedId) return
                    if (!isActive) {
                      setActiveIndex(index)
                      return
                    }
                    openEditor(item)
                  }}
                >
                  {isExpanded ? (
                    <form
                      className="flex min-h-[674px] flex-col gap-3"
                      onClick={(event) => event.stopPropagation()}
                      onSubmit={handleSaveChanges}
                    >
                      <div className="relative flex h-[320px] items-center justify-center overflow-hidden rounded-[12px] border-2 border-[#FFD6E0] bg-rose-50">
                        <label
                          className="flex h-full w-full cursor-pointer items-center justify-center overflow-hidden"
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
                            <span className="text-6xl">🐰</span>
                          )}
                        </label>
                        {isUploading && (
                          <p className="absolute bottom-3 rounded-md bg-white/90 px-3 py-1 text-xs text-zinc-500 shadow-sm">
                            Uploading image...
                          </p>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col rounded-[12px] border-2 border-[#FFD6E0] bg-[#FFF5F7]">
                        <div className="flex-1 space-y-4 px-4 py-4">
                          <input
                            required
                            value={editForm.name}
                            onChange={(event) =>
                              updateEditForm({ name: event.target.value })
                            }
                            className="min-h-11 w-full border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-base font-semibold outline-none"
                            placeholder="Name"
                            type="text"
                          />

                          <input
                            value={editForm.quantity}
                            onChange={(event) =>
                              updateEditForm({ quantity: event.target.value })
                            }
                            className="min-h-11 w-full border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-base outline-none"
                            min="1"
                            placeholder="Quantity"
                            type="number"
                          />

                          <textarea
                            value={editForm.notes}
                            onChange={(event) =>
                              updateEditForm({ notes: event.target.value })
                            }
                            className="min-h-28 w-full resize-none border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-base outline-none"
                            placeholder="Notes"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3 border-t border-[#FFD6E0] bg-white px-4 py-3">
                          <button
                            type="submit"
                            disabled={isSaving || isUploading}
                            className="min-h-11 rounded-md bg-[#FF8FB3] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
                          >
                            {isSaving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={closeEditor}
                            className="min-h-11 rounded-md border border-[#FFD6E0] bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-rose-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <div className="flex h-full min-h-[434px] flex-col gap-3">
                      <div className="flex h-[300px] items-center justify-center overflow-hidden rounded-[12px] border-2 border-[#FFD6E0] bg-rose-50">
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

                      <div className="min-h-[120px] rounded-[12px] border-2 border-[#FFD6E0] bg-[#FFF5F7] px-3 py-3 text-center">
                        <h2 className="line-clamp-2 text-lg font-bold leading-tight text-[#FF85A1]">
                          {item.name}
                        </h2>
                        <p className="mt-2 text-sm font-semibold text-[#FF85A1]">
                          Qty {item.quantity}
                        </p>
                        <div className="mt-2 overflow-hidden text-xs leading-5 text-zinc-500">
                          {item.notes ? (
                            <p className="line-clamp-3">{item.notes}</p>
                          ) : (
                            <p className="text-zinc-400">No notes</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </section>
        )}
      </div>

      {!expandedId && (
        <Link
          href="/admin/add"
          className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-3xl font-light text-white shadow-lg transition hover:bg-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-200"
          aria-label="Add new item"
        >
          +
        </Link>
      )}
    </main>
  )
}
