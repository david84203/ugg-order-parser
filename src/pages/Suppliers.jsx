import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Building2, ExternalLink, ChevronRight } from 'lucide-react'
import { useSuppliers } from '../hooks/useSuppliers'
import SupplierModal from '../components/SupplierModal'

export default function Suppliers() {
  const { suppliers, loading, addSupplier, updateSupplier, deleteSupplier } = useSuppliers()
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null) // null | 'add' | supplier object
  const navigate = useNavigate()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter(s =>
      s.name?.toLowerCase().includes(q) || s.contact?.toLowerCase().includes(q)
    )
  }, [suppliers, search])

  async function handleSave(data) {
    if (modal === 'add') await addSupplier(data)
    else await updateSupplier(modal.id, data)
  }

  async function handleDelete(id) {
    await deleteSupplier(id)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-800">廠商管理</h1>
            <p className="text-sm text-gray-400 mt-0.5">共 {suppliers.length} 家廠商</p>
          </div>
          <button
            onClick={() => setModal('add')}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition"
          >
            <Plus size={16} />
            新增廠商
          </button>
        </div>

        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-400"
            placeholder="搜尋廠商名稱或聯絡人..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-20">載入中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-400 py-20">
            {search ? '找不到符合的廠商' : '還沒有廠商資料，點右上角新增'}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(s => (
              <div
                key={s.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition"
                onClick={() => navigate(`/suppliers/${s.id}`)}
              >
                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <Building2 size={18} className="text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800">{s.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-3">
                    {s.contact && <span>{s.contact}</span>}
                    {s.line && <span>LINE: {s.line}</span>}
                    {s.lastOrderDate && <span>最後訂貨：{s.lastOrderDate}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {s.orderUrl && (
                    <a
                      href={s.orderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition"
                      title="開啟訂單連結"
                    >
                      <ExternalLink size={15} />
                    </a>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); setModal(s) }}
                    className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-100 transition"
                  >
                    編輯
                  </button>
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <SupplierModal
          supplier={modal === 'add' ? null : modal}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
