import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ChevronRight, Search } from 'lucide-react'
import { useOrders } from '../hooks/useOrders'
import { useSuppliers } from '../hooks/useSuppliers'

export default function Orders() {
  const { orders, loading } = useOrders()
  const { suppliers } = useSuppliers()
  const [search, setSearch] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (filterSupplier && o.supplierId !== filterSupplier) return false
      if (search) {
        const q = search.toLowerCase()
        if (!o.supplierName?.toLowerCase().includes(q) &&
            !o.orderDate?.includes(q) &&
            !o.items?.some(i => i.name?.toLowerCase().includes(q))) return false
      }
      return true
    })
  }, [orders, search, filterSupplier])

  const totalAmount = filtered.reduce((s, o) => s + (o.totalAmount || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-800">歷史訂單</h1>
            <p className="text-sm text-gray-400 mt-0.5">共 {filtered.length} 筆</p>
          </div>
          <Link
            to="/orders/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition"
          >
            <Plus size={16} />
            新增訂單
          </Link>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-400"
              placeholder="搜尋廠商、日期或遊戲名稱..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-orange-400"
            value={filterSupplier}
            onChange={e => setFilterSupplier(e.target.value)}
          >
            <option value="">全部廠商</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {filtered.length > 0 && (
          <div className="bg-orange-50 rounded-xl px-4 py-2.5 mb-4 text-sm text-orange-700">
            篩選結果進貨總額：NT${totalAmount.toLocaleString()}
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-400 py-20">載入中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-400 py-20">
            {search || filterSupplier ? '找不到符合的訂單' : '還沒有訂單紀錄'}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(o => (
              <Link
                key={o.id}
                to={`/orders/${o.id}`}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between hover:shadow-md transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{o.supplierName || '未指定廠商'}</span>
                    <span className="text-sm text-gray-400">{o.orderDate}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {o.items?.length || 0} 款遊戲
                    {o.totalAmount ? `・NT$${o.totalAmount.toLocaleString()}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    o.synced ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'
                  }`}>
                    {o.synced ? '已匯入' : '待確認'}
                  </span>
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
