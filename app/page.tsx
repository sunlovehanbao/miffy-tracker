'use client'

import Link from 'next/link'
import {
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type TouchEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { supabase } from '@/lib/supabase'
import type { Item, ItemStore } from '@/types/item'

const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp']

interface EditForm {
  name: string
  store: ItemStore
  quantity: string
  notes: string
  imageUrl: string
  imageUrlInput: string
  previewUrl: string
}

const emptyEditForm: EditForm = {
  name: '',
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm)
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const touchStartX = useRef(0)

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
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeEditor()
    }

    if (expandedId) window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
    // closeEditor reads the active form state when Escape is pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId])

  useEffect(() => {
    return () => {
      if (editForm.previewUrl) URL.revokeObjectURL(editForm.previewUrl)
    }
  }, [editForm.previewUrl])

  const activeSelectedIndex =
    items.length > 0 ? Math.min(selectedIndex, items.length - 1) : 0
  const editImageUrl = editForm.previewUrl || editForm.imageUrl

  function updateEditForm(fields: Partial<EditForm>) {
    setEditForm((currentForm) => ({ ...currentForm, ...fields }))
  }

  function getFormFromItem(item: Item): EditForm {
    return {
      name: item.name || '',
      store: item.store || 'Other',
      quantity: String(item.quantity || 1),
      notes: item.notes || '',
      imageUrl: item.image_url || '',
      imageUrlInput: item.image_url || '',
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
    if (!expandedId) return

    if (editForm.previewUrl) URL.revokeObjectURL(editForm.previewUrl)
    setExpandedId(null)
    setEditForm(emptyEditForm)
    setError('')
    setIsUploading(false)
    setIsSaving(false)
  }

  function getFanCardStyle(index: number): CSSProperties {
    const relativeIndex = index - activeSelectedIndex
    const distance = Math.abs(relativeIndex)
    const rotation = Math.max(-30, Math.min(30, relativeIndex * 10))
    const offsetX = relativeIndex * 62
    const offsetY = distance * 24
    const scale = relativeIndex === 0 ? 1 : 0.85

    return {
      transform: `translateX(calc(-50% + ${offsetX}px)) translateY(${offsetY}px) rotate(${rotation}deg) scale(${scale})`,
      transformOrigin: '50% 100%',
      zIndex: 100 - distance,
    }
  }

  function handleFanTouchStart(event: TouchEvent<HTMLElement>) {
    touchStartX.current = event.touches[0].clientX
  }

  function handleFanTouchEnd(event: TouchEvent<HTMLElement>) {
    const deltaX = event.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(deltaX) < 40) return

    setSelectedIndex((currentIndex) => {
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

  async function handleSaveChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!expandedId) return

    setError('')
    setIsSaving(true)

    const updatedItem: Partial<Item> = {
      name: editForm.name.trim(),
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
            <div className="text-5xl">馃惏</div>
            <p className="mt-4 text-lg font-medium">No items found</p>
          </div>
        ) : (
          <section
            className={`relative overflow-hidden transition-[height] duration-300 ease-out ${
              expandedId ? 'h-[820px]' : 'h-[650px]'
            }`}
            onTouchStart={expandedId ? undefined : handleFanTouchStart}
            onTouchEnd={expandedId ? undefined : handleFanTouchEnd}
          >
            {items.map((item, index) => {
              const isEditingThisItem = expandedId === item.id
              const isDimmed = Boolean(expandedId && !isEditingThisItem)

              return (
                <article
                  key={item.id}
                  onClick={() => {
                    if (expandedId) return

                    setSelectedIndex(index)
                    openEditor(item)
                  }}
                  className={`group absolute bottom-8 left-1/2 w-[300px] cursor-pointer overflow-hidden rounded-[16px] border-2 border-[#FFD6E0] bg-white p-3 shadow-[0_4px_12px_rgba(255,183,197,0.3)] transition-[height,opacity,box-shadow] duration-300 ease-out hover:shadow-[0_10px_24px_rgba(255,183,197,0.45)] active:shadow-[0_10px_24px_rgba(255,183,197,0.45)] ${
                    isEditingThisItem
                      ? 'h-[700px]'
                      : 'h-[460px]'
                  }`}
                  style={{
                    ...getFanCardStyle(index),
                    opacity: isDimmed ? 0.3 : 1,
                    pointerEvents: isDimmed ? 'none' : 'auto',
                  }}
                >
                  {isEditingThisItem ? (
                    <form
                      onSubmit={handleSaveChanges}
                      onClick={(event) => event.stopPropagation()}
                      className="flex h-full flex-col gap-3 bg-white"
                    >
                      <div className="relative flex h-[330px] w-full items-center justify-center overflow-hidden rounded-[12px] border-2 border-[#FFD6E0] bg-rose-50">
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
                            <div className="text-center">
                              <div className="text-5xl">馃惏</div>
                              <p className="mt-2 text-sm font-medium text-zinc-700">
                                Click to upload an image
                              </p>
                            </div>
                          )}
                        </label>
                        {isUploading && (
                          <p className="absolute bottom-3 rounded-md bg-white/90 px-3 py-1 text-xs text-zinc-500 shadow-sm">
                            Uploading image...
                          </p>
                        )}
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col rounded-[12px] border-2 border-[#FFD6E0] bg-[#FFF5F7]">
                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                          <input
                            required
                            value={editForm.name}
                            onChange={(event) =>
                              updateEditForm({ name: event.target.value })
                            }
                            className="min-h-10 w-full border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-base font-semibold outline-none"
                            placeholder="Name"
                            type="text"
                          />

                          <input
                            value={editForm.quantity}
                            onChange={(event) =>
                              updateEditForm({ quantity: event.target.value })
                            }
                            className="min-h-10 w-full border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-sm outline-none"
                            min="1"
                            placeholder="Quantity"
                            type="number"
                          />

                          <textarea
                            value={editForm.notes}
                            onChange={(event) =>
                              updateEditForm({ notes: event.target.value })
                            }
                            className="min-h-20 w-full resize-none border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-sm outline-none"
                            placeholder="Notes"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3 border-t border-[#FFD6E0] bg-white/80 px-4 py-3">
                          <button
                            type="submit"
                            disabled={isSaving || isUploading}
                            className="min-h-11 rounded-md bg-[#FF8FB3] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
                          >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                          </button>
                          <button
                            type="button"
                            onClick={closeEditor}
                            className="min-h-11 rounded-md border border-[#FFD6E0] bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-rose-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <div className="flex h-full flex-col justify-between gap-3 bg-white">
                      <div className="flex h-[275px] w-full items-center justify-center overflow-hidden rounded-[12px] border-2 border-[#FFD6E0] bg-rose-50">
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-6xl">馃惏</span>
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
