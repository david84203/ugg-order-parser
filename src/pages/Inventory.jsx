import { useState, useMemo } from 'react'
import { Search, Package, ExternalLink } from 'lucide-react'
import { useEffect } from 'react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase/config'

export default function Inventory() {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'inventory'), orderBy('name'))
    const unsub = onSnapshot(q, snap => {
      setGames(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, err => console.error(err))
    return unsub
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return games
    return games.filter(g => g.name?.toLowerCase().includes(q))
  }, [games, search])

  const totalStock = games.reduce((s, g) => s + (g.stock || 0), 0)
  const totalCost = games.reduce((s, g) => s + (g.cost || 0) * (g.stock || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-800">倉儲庫存</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              共 {games.length} 款・{totalStock} 件・成本 NT${totalCost.toLocaleString()}
            </p>
          </div>
          <a
            href="https://ugg-inventory.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition"
          >
            <ExternalLink size={14} />
            開啟倉儲系統
          </a>
        </div>

        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-400"
            placeholder="搜尋遊戲名稱..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-20">載入中...</div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="grid grid-cols-12 text-xs font-medium text-gray-400 bg-gray-50 px-4 py-2 border-b border-gray-100">
              <div className="col-span-6">遊戲名稱</div>
              <div className="col-span-2 text-right">售價</div>
              <div className="col-span-2 text-right">進價</div>
              <div className="col-span-2 text-right">庫存</div>
            </div>
            {filtered.length === 0 ? (
              <div className="text-center text-gray-400 py-10">找不到符合的遊戲</div>
            ) : filtered.map(g => (
              <div key={g.id} className="grid grid-cols-12 items-center px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition">
                <div className="col-span-6 text-sm font-medium text-gray-800">{g.name}</div>
                <div className="col-span-2 text-sm text-right text-gray-600">
                  {g.price ? `NT$${g.price.toLocaleString()}` : '—'}
                </div>
                <div className="col-span-2 text-sm text-right text-gray-600">
                  {g.cost ? `NT$${g.cost.toLocaleString()}` : '—'}
                </div>
                <div className="col-span-2 text-right">
                  <span className={`text-sm font-medium ${g.stock === 0 ? 'text-red-400' : 'text-gray-700'}`}>
                    {g.stock || 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
