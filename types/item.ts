export type ItemCategory =
  | 'Stationery'
  | 'Mugs & Drinkware'
  | 'Plush & Figures'
  | 'Kitchen'
  | 'Baby & Nursery'
  | 'Home Decor'
  | 'Other'

export type ItemStore = 'Marshalls' | 'TJ Maxx' | 'HomeGoods' | 'Other'

export interface Item {
  id: string
  name: string
  category: ItemCategory
  store?: ItemStore
  quantity: number
  notes?: string
  image_url?: string
  created_at: string
}
