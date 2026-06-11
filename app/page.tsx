'use client'

import Link from 'next/link'
import {
  type CSSProperties,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type MouseEvent,
  useEffect,
  useMemo,
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
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [storeFilter, setStoreFilter] = useState('')
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
    // closeExpandedCard reads the active form state during the key event.
    // Rebinding the listener for every form keystroke is unnecessary here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingItem])

  useEffect(() => {
    return () => {
      if (editForm.previewUrl) URL.revokeObjectURL(editForm.previewUrl)
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [editForm.previewUrl])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()

    return items.filter((item) => {
      const matchesSearch = !query || item.name.toLowerCase().includes(query)
      const matchesCategory =
        !categoryFilter || item.category === categoryFilter
      const matchesStore = !storeFilter || item.store === storeFilter

      return matchesSearch && matchesCategory && matchesStore
    })
  }, [categoryFilter, items, search, storeFilter])

  const totalQuantity = useMemo(
    () => items.reduce((total, item) => total + (item.quantity || 1), 0),
    [items],
  )

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
      height: isExpanded ? 'min(760px, calc(100vh - 32px))' : expandedRect.height,
      left: isExpanded ? '50%' : expandedRect.left,
      top: isExpanded ? '50%' : expandedRect.top,
      transform: isExpanded ? 'translate(-50%, -50%)' : 'translate(0, 0)',
      width: isExpanded ? 'min(672px, calc(100vw - 32px))' : expandedRect.width,
    }
  }

  async function deleteItem(item: Item, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    const confirmed = window.confirm(`Delete "${item.name}"?`)
    if (!confirmed) return

    const { error: deleteError } = await supabase
      .from('items')
      .delete()
      .eq('id', item.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setItems((currentItems) =>
      currentItems.filter((currentItem) => currentItem.id !== item.id),
    )
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

  const editImageUrl = editForm.previewUrl || editForm.imageUrl

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header>
          <h1 className="flex items-center text-4xl font-semibold sm:text-5xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/miffy-logo.png"
              alt="Miffy"
              className="mr-2 inline-block h-10 w-10"
            />
            Miffy Collection
          </h1>
          <p className="mt-3 text-lg text-zinc-600">
            Total items: {totalQuantity}
          </p>
        </header>

        <section className="mt-8 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row">
            <label className="w-full flex-1 space-y-2">
              <span className="text-sm font-medium text-zinc-700">Search</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name"
                className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus:border-zinc-950"
                type="search"
              />
            </label>

            <label className="w-full flex-1 space-y-2">
              <span className="text-sm font-medium text-zinc-700">
                Category
              </span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus:border-zinc-950"
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="w-full flex-1 space-y-2">
              <span className="text-sm font-medium text-zinc-700">Store</span>
              <select
                value={storeFilter}
                onChange={(event) => setStoreFilter(event.target.value)}
                className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus:border-zinc-950"
              >
                <option value="">All stores</option>
                {stores.map((store) => (
                  <option key={store} value={store}>
                    {store}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {error && !editingItem && (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {isLoading ? (
          <p className="mt-10 text-center text-sm text-zinc-500">
            Loading collection...
          </p>
        ) : filteredItems.length === 0 ? (
          <div className="mt-10 rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
            <div className="text-5xl">🐰</div>
            <p className="mt-4 text-lg font-medium">No items found</p>
          </div>
        ) : (
          <section className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => (
              <article
                key={item.id}
                onClick={(event) => openExpandedCard(item, event.currentTarget)}
                className="cursor-pointer overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-xl active:scale-105 active:shadow-xl"
              >
                <div className="flex aspect-square w-full items-center justify-center bg-rose-50">
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

                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold">{item.name}</h2>
                    <button
                      type="button"
                      onClick={(event) => deleteItem(item, event)}
                      className="min-h-11 rounded-md border border-red-200 px-4 py-2 text-base font-medium text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
                      {item.category}
                    </span>
                    {item.store && (
                      <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                        {item.store}
                      </span>
                    )}
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                      Qty {item.quantity}
                    </span>
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
            className="fixed overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xl transition-all duration-300 ease-out"
            style={getExpandedCardStyle()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
                <div className="space-y-2">
                  <span className="text-sm font-medium">Image</span>
                  <label
                    className="flex min-h-[220px] cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 p-4 text-center transition hover:border-zinc-400"
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
                        className="max-h-72 max-w-full rounded-md object-contain"
                      />
                    ) : (
                      <div>
                        <div className="text-5xl">🐰</div>
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
                      value={editForm.imageUrlInput}
                      onBlur={() => importImageFromUrl(editForm.imageUrlInput)}
                      onChange={(event) =>
                        updateEditForm({ imageUrlInput: event.target.value })
                      }
                      onPaste={handleImageUrlPaste}
                      className="min-h-11 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-base outline-none focus:border-zinc-950"
                      placeholder="https://..."
                      type="url"
                    />
                    {editForm.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={editForm.imageUrl}
                        alt="Imported image preview"
                        className="h-16 w-16 rounded-md border border-zinc-200 object-cover"
                      />
                    )}
                  </div>
                  {isImportingImage && (
                    <p className="text-sm text-zinc-500">Importing image...</p>
                  )}
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium">Name</span>
                  <input
                    required
                    value={editForm.name}
                    onChange={(event) =>
                      updateEditForm({ name: event.target.value })
                    }
                    className="min-h-11 w-full rounded-md border border-zinc-300 px-3 py-2 text-base outline-none focus:border-zinc-950"
                    type="text"
                  />
                </label>

                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium">Category</span>
                    <select
                      required
                      value={editForm.category}
                      onChange={(event) =>
                        updateEditForm({
                          category: event.target.value as ItemCategory,
                        })
                      }
                      className="min-h-11 w-full rounded-md border border-zinc-300 px-3 py-2 text-base outline-none focus:border-zinc-950"
                    >
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium">Store</span>
                    <select
                      value={editForm.store}
                      onChange={(event) =>
                        updateEditForm({
                          store: event.target.value as ItemStore,
                        })
                      }
                      className="min-h-11 w-full rounded-md border border-zinc-300 px-3 py-2 text-base outline-none focus:border-zinc-950"
                    >
                      {stores.map((store) => (
                        <option key={store} value={store}>
                          {store}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="text-sm font-medium">Quantity</span>
                  <input
                    value={editForm.quantity}
                    onChange={(event) =>
                      updateEditForm({ quantity: event.target.value })
                    }
                    className="min-h-11 w-full rounded-md border border-zinc-300 px-3 py-2 text-base outline-none focus:border-zinc-950"
                    min="1"
                    type="number"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium">Notes</span>
                  <textarea
                    value={editForm.notes}
                    onChange={(event) =>
                      updateEditForm({ notes: event.target.value })
                    }
                    className="min-h-28 w-full rounded-md border border-zinc-300 px-3 py-2 text-base outline-none focus:border-zinc-950"
                  />
                </label>

                {error && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </p>
                )}
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-zinc-200 bg-white p-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeExpandedCard}
                  className="min-h-[50px] rounded-md border border-zinc-300 px-5 py-3 text-base font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isUploading || isImportingImage}
                  className="min-h-[50px] rounded-md bg-zinc-950 px-5 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
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
