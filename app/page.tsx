'use client'

import Link from 'next/link'
import {
  type TouchEvent,
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

export default function Home() {
  const [items, setItems] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [storeFilter, setStoreFilter] = useState('')
  const [selectedImage, setSelectedImage] = useState<{
    url: string
    alt: string
  } | null>(null)
  const [imageZoom, setImageZoom] = useState(1)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const pinchStartDistance = useRef(0)
  const pinchStartZoom = useRef(1)
  const hasPinched = useRef(false)

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
      if (event.key === 'Escape') {
        closeImageModal()
      }
    }

    if (selectedImage) {
      window.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedImage])

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

  async function deleteItem(item: Item) {
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

  function closeImageModal() {
    setSelectedImage(null)
    setImageZoom(1)
    pinchStartDistance.current = 0
    hasPinched.current = false
  }

  function getTouchDistance(touches: TouchEvent<HTMLDivElement>['touches']) {
    if (touches.length < 2) return 0

    const firstTouch = touches[0]
    const secondTouch = touches[1]
    return Math.hypot(
      firstTouch.clientX - secondTouch.clientX,
      firstTouch.clientY - secondTouch.clientY,
    )
  }

  function handleModalTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length === 2) {
      pinchStartDistance.current = getTouchDistance(event.touches)
      pinchStartZoom.current = imageZoom
      hasPinched.current = true
      return
    }

    const touch = event.touches[0]
    touchStartX.current = touch.clientX
    touchStartY.current = touch.clientY
    hasPinched.current = false
  }

  function handleModalTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 2 || pinchStartDistance.current === 0) return

    event.preventDefault()
    const nextDistance = getTouchDistance(event.touches)
    const nextZoom = pinchStartZoom.current * (nextDistance / pinchStartDistance.current)
    setImageZoom(Math.min(4, Math.max(0.5, nextZoom)))
  }

  function handleModalTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (hasPinched.current) {
      if (event.touches.length < 2) pinchStartDistance.current = 0
      return
    }

    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - touchStartX.current
    const deltaY = touch.clientY - touchStartY.current

    if (Math.abs(deltaX) > 90 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      closeImageModal()
    }
  }

  return (
    <main className="min-h-screen bg-[#fbfdff] px-4 py-8 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header>
          <h1 className="flex items-center text-4xl font-semibold sm:text-5xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/miffy-logo.png"
              alt="Miffy"
              className="w-10 h-10 inline-block mr-2"
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

        {error && (
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
                className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (item.image_url) {
                      setSelectedImage({
                        url: item.image_url,
                        alt: item.name,
                      })
                      setImageZoom(1)
                    }
                  }}
                  className="flex aspect-square w-full items-center justify-center bg-rose-50"
                  aria-label={`Enlarge image for ${item.name}`}
                >
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
                </button>

                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold">{item.name}</h2>
                    <div className="flex gap-2">
                      <Link
                        href={`/admin/edit/${item.id}`}
                        className="flex min-h-11 items-center rounded-md border border-zinc-200 px-4 py-2 text-base font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => deleteItem(item)}
                        className="min-h-11 rounded-md border border-red-200 px-4 py-2 text-base font-medium text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
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

      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex touch-none items-center justify-center overflow-hidden bg-zinc-950/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeImageModal}
          onTouchStart={handleModalTouchStart}
          onTouchMove={handleModalTouchMove}
          onTouchEnd={handleModalTouchEnd}
          onWheel={(event) => {
            event.preventDefault()
            setImageZoom((currentZoom) => {
              const nextZoom =
                event.deltaY < 0 ? currentZoom + 0.15 : currentZoom - 0.15
              return Math.min(4, Math.max(0.5, nextZoom))
            })
          }}
        >
          <button
            type="button"
            onClick={closeImageModal}
            className="absolute right-4 top-4 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white px-3 py-1 text-2xl font-medium text-zinc-950 shadow"
            aria-label="Close image preview"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selectedImage.url}
            alt={selectedImage.alt}
            className="max-h-[90vh] max-w-full rounded-lg object-contain transition-transform"
            style={{ transform: `scale(${imageZoom})` }}
            onClick={(event) => event.stopPropagation()}
          />
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
