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

type Mode = 'fan' | 'selected' | 'editing'
type PullStage = 'idle' | 'pulling'

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

function clampIndex(index: number, total: number) {
  return Math.min(Math.max(index, 0), Math.max(total - 1, 0))
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<Mode>('fan')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  const [isFlyingToSelected, setIsFlyingToSelected] = useState(false)
  const [isSelectedEnterActive, setIsSelectedEnterActive] = useState(false)
  const [pullingIndex, setPullingIndex] = useState<number | null>(null)
  const [pullStage, setPullStage] = useState<PullStage>('idle')
  const [fanDragOffsetX, setFanDragOffsetX] = useState(0)
  const [isFanDragging, setIsFanDragging] = useState(false)
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm)
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const flyTimer = useRef<number | null>(null)
  const enterTimer = useRef<number | null>(null)

  const currentItem = items[currentIndex]
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
    setCurrentIndex((index) => clampIndex(index, items.length))
  }, [items.length])

  useEffect(() => {
    return () => {
      if (editForm.previewUrl) URL.revokeObjectURL(editForm.previewUrl)
      if (flyTimer.current) window.clearTimeout(flyTimer.current)
      if (enterTimer.current) window.clearTimeout(enterTimer.current)
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

  function moveCurrentIndex(direction: 1 | -1) {
    setCurrentIndex((index) => clampIndex(index + direction, items.length))
    setHighlightedIndex(null)
  }

  function startTouch(event: TouchEvent<HTMLElement>) {
    touchStartX.current = event.touches[0].clientX
    touchStartY.current = event.touches[0].clientY

    if (mode === 'fan') {
      setIsFanDragging(true)
      setFanDragOffsetX(0)
    }
  }

  function preventScrollDuringSwipe(event: TouchEvent<HTMLElement>) {
    const deltaX = event.touches[0].clientX - touchStartX.current
    const deltaY = event.touches[0].clientY - touchStartY.current

    if (mode === 'fan') {
      event.preventDefault()
      setFanDragOffsetX(deltaX)
      return
    }

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      event.preventDefault()
    }
  }

  function endSwipe(event: TouchEvent<HTMLElement>) {
    if (mode === 'editing') return

    const deltaX = event.changedTouches[0].clientX - touchStartX.current

    if (mode === 'fan') {
      if (Math.abs(deltaX) > swipeThreshold) {
        setCurrentIndex((index) => {
          if (items.length === 0) return 0
          return deltaX < 0
            ? (index + 1) % items.length
            : (index - 1 + items.length) % items.length
        })
        setHighlightedIndex(null)
      }

      setFanDragOffsetX(0)
      setIsFanDragging(false)
      return
    }

    if (Math.abs(deltaX) <= swipeThreshold) return

    moveCurrentIndex(deltaX < 0 ? 1 : -1)
    if (mode === 'selected') {
      setMode('selected')
    }
  }

  function handleFanCardClick(index: number) {
    if (pullingIndex !== null) return

    if (highlightedIndex === index) {
      setCurrentIndex(index)
      setHighlightedIndex(null)
      if (flyTimer.current) window.clearTimeout(flyTimer.current)
      if (enterTimer.current) window.clearTimeout(enterTimer.current)

      setPullingIndex(index)
      setPullStage('pulling')

      enterTimer.current = window.setTimeout(() => {
        setMode('selected')
        setPullingIndex(null)
        setPullStage('idle')
        setIsFlyingToSelected(true)
        setIsSelectedEnterActive(false)

        window.requestAnimationFrame(() => {
          setIsSelectedEnterActive(true)
        })
      }, 300)

      flyTimer.current = window.setTimeout(() => {
        setIsFlyingToSelected(false)
        setIsSelectedEnterActive(false)
      }, 700)
      return
    }

    setHighlightedIndex(index)
  }

  function openEditor(item: Item) {
    if (editForm.previewUrl) URL.revokeObjectURL(editForm.previewUrl)
    setEditForm(getFormFromItem(item))
    setError('')
    setMode('editing')
  }

  function cancelEdit() {
    if (editForm.previewUrl) URL.revokeObjectURL(editForm.previewUrl)
    setEditForm(emptyEditForm)
    setError('')
    setIsUploading(false)
    setIsSaving(false)
    setMode('selected')
  }

  function getFanCardStyle(index: number): CSSProperties {
    const total = items.length
    const slot = total > 0 ? (index - currentIndex + total) % total : 0
    const progress = total > 1 ? slot / (total - 1) : 1
    const spreadWidth = 200 + Math.max(total - 1, 0) * 60
    const x = -spreadWidth / 2 + 100 + slot * 60 + fanDragOffsetX
    const yArc = total > 1 ? -Math.sin(progress * Math.PI) * 24 : 0
    const isHighlighted = highlightedIndex === index
    const isPulling = pullingIndex !== null && pullStage === 'pulling'
    const isPulledCard = pullingIndex === index
    const yLift = isHighlighted ? -30 : 0
    const angle = total > 1 ? -15 + progress * 15 : 0
    const pullY = isPulling ? (isPulledCard ? '-100vh' : '100vh') : null
    const transition = isFanDragging
      ? 'none'
      : isPulling
        ? isPulledCard
          ? 'transform 0.2s ease-in, box-shadow 0.2s ease-in'
          : 'transform 0.3s ease-in, box-shadow 0.3s ease-in'
        : isHighlighted
          ? 'transform 0.2s ease-out, box-shadow 0.2s ease-out'
          : 'transform 0.15s ease-out, box-shadow 0.15s ease-out'

    return {
      top: '50%',
      left: '50%',
      width: '200px',
      height: '300px',
      opacity: 1,
      transform: `translateX(calc(-50% + ${x}px)) translateY(${
        pullY || `calc(-50% + ${yArc + yLift}px)`
      }) rotate(${angle}deg)`,
      transformOrigin: '50% 90%',
      transition,
      zIndex: isHighlighted || isPulledCard ? 300 : 100 + slot,
      boxShadow: isHighlighted || isPulledCard
        ? '0 0 25px rgba(255,215,0,0.9)'
        : '0 4px 12px rgba(255,183,197,0.3)',
    }
  }

  function getSelectedCardStyle(index: number): CSSProperties {
    const relativeIndex = index - currentIndex
    const isVisible = Math.abs(relativeIndex) <= 1
    const isCurrent = relativeIndex === 0
    const normalTransform = `translateX(calc(-50% + ${relativeIndex * 316}px)) translateY(-50%) scale(1)`

    return {
      top: '50%',
      left: '50%',
      width: '300px',
      minHeight: mode === 'editing' && relativeIndex === 0 ? '620px' : '450px',
      opacity: isCurrent ? 1 : isFlyingToSelected ? 0 : 0.6,
      pointerEvents: isVisible ? 'auto' : 'none',
      transform:
        isFlyingToSelected && isCurrent && !isSelectedEnterActive
          ? 'translateX(-50%) translateY(-100vh) scale(0.5)'
          : normalTransform,
      transition:
        isFlyingToSelected && isCurrent
          ? 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease-out'
          : undefined,
      zIndex: 20 - Math.abs(relativeIndex),
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
    const item = items[currentIndex]
    if (!item) return

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
      .eq('id', item.id)
      .select('*')
      .single()

    setIsSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    const savedItem = data as Item
    setItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === savedItem.id ? savedItem : currentItem,
      ),
    )
    if (editForm.previewUrl) URL.revokeObjectURL(editForm.previewUrl)
    setEditForm(emptyEditForm)
    setMode('selected')
  }

  function renderCardContent(item: Item, compact = false) {
    return (
      <div className="flex h-full flex-col gap-2">
        <div
          className={`flex items-center justify-center overflow-hidden rounded-[12px] border-2 border-[#FFD6E0] bg-rose-50 ${
            compact ? 'h-[190px]' : 'h-[300px]'
          }`}
        >
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className={compact ? 'text-4xl text-[#FF8FB3]' : 'text-6xl text-[#FF8FB3]'}>
              +
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center rounded-[12px] border-2 border-[#FFD6E0] bg-[#FFF5F7] px-3 py-3 text-center">
          <h2
            className={`line-clamp-2 font-bold leading-tight text-[#FF85A1] ${
              compact ? 'text-sm' : 'text-lg'
            }`}
          >
            {item.name}
          </h2>
          <p
            className={`mt-2 font-semibold text-[#FF85A1] ${
              compact ? 'text-xs' : 'text-sm'
            }`}
          >
            Qty {item.quantity}
          </p>
        </div>
      </div>
    )
  }

  function renderEditCard(item: Item) {
    return (
      <form
        onSubmit={handleSaveChanges}
        className="flex h-full flex-col gap-2"
        onClick={(event) => event.stopPropagation()}
      >
        <label
          className="relative flex h-[300px] cursor-pointer items-center justify-center overflow-hidden rounded-[12px] border-2 border-[#FFD6E0] bg-rose-50"
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
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />
          {editImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={editImageUrl}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-6xl text-[#FF8FB3]">+</span>
          )}
          {isUploading && (
            <span className="absolute bottom-3 rounded-md bg-white/90 px-3 py-1 text-xs text-zinc-500 shadow-sm">
              Uploading...
            </span>
          )}
        </label>

        <div className="flex flex-1 flex-col rounded-[12px] border-2 border-[#FFD6E0] bg-[#FFF5F7]">
          <div className="flex-1 space-y-4 px-4 py-4">
            <input
              required
              value={editForm.name}
              onChange={(event) => updateEditForm({ name: event.target.value })}
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
              className="min-h-24 w-full resize-none border-0 border-b border-[#FFD6E0] bg-transparent px-0 text-base outline-none"
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
              onClick={cancelEdit}
              className="min-h-11 rounded-md border border-[#FFD6E0] bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-rose-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    )
  }

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-[#f5f5f5] text-zinc-950"
      style={{ touchAction: 'none' }}
    >
      {error && (
        <p className="absolute left-4 right-4 top-4 z-50 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="absolute left-0 right-0 top-1/2 -translate-y-1/2 text-center text-sm text-zinc-500">
          Loading collection...
        </p>
      ) : items.length === 0 ? (
        <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="text-lg font-medium">No items found</p>
        </div>
      ) : (
        <section
          className="absolute inset-0 overflow-hidden"
          onClick={() => {
            if (mode === 'selected') {
              setMode('fan')
              setHighlightedIndex(null)
            }
          }}
          onTouchStart={startTouch}
          onTouchMove={preventScrollDuringSwipe}
          onTouchEnd={endSwipe}
        >
          {mode === 'fan' &&
            items.map((item, index) => (
              <article
                key={item.id}
                className="absolute overflow-hidden rounded-[16px] border-2 border-[#FFD6E0] bg-white p-2 transition-all duration-200 ease-out"
                style={getFanCardStyle(index)}
                onClick={(event) => {
                  event.stopPropagation()
                  handleFanCardClick(index)
                }}
              >
                {renderCardContent(item, true)}
              </article>
            ))}

          {(mode === 'selected' || mode === 'editing') &&
            items.map((item, index) => {
              const relativeIndex = index - currentIndex
              const isVisible = Math.abs(relativeIndex) <= 1
              const isCurrent = index === currentIndex

              if (!isVisible) return null

              return (
                <article
                  key={item.id}
                  className={`absolute overflow-hidden rounded-[16px] border-2 border-[#FFD6E0] bg-white p-3 shadow-[0_4px_12px_rgba(255,183,197,0.3)] transition-all ease-out ${
                    isFlyingToSelected ? 'duration-300' : 'duration-200'
                  }`}
                  style={getSelectedCardStyle(index)}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (mode === 'editing') return
                    if (!isCurrent) {
                      setCurrentIndex(index)
                      return
                    }
                    openEditor(item)
                  }}
                >
                  {mode === 'editing' && isCurrent
                    ? renderEditCard(item)
                    : renderCardContent(item)}
                </article>
              )
            })}
        </section>
      )}

      <Link
        href="/admin/add"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-3xl font-light text-white shadow-lg transition hover:bg-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-200"
        aria-label="Add new item"
      >
        +
      </Link>
    </main>
  )
}
