import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Edit2, Plus, ChevronRight, Globe, MessageCircle, User } from 'lucide-react'
import { useSuppliers } from '../hooks/useSuppliers'
import { useOrders } from '../hooks/useOrders'
import SupplierModal from '../components/SupplierModal'

export default function SupplierDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { suppliers, updateSupplier, deleteSupplier } = useSuppliers()
  const { orders, loading: ordersLoading } = useOrders(id)
  const [editModal, setEditModal] = useState(false)

  const supplier = suppliers.find(s => s.id === id)

  if (!supplier) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
        找不到廠商
      </div>
    )
  }

  const totalAmount = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0)

  async function handleSave(data) {
    await updateSupplier(id, data)
  }

  async function handleDelete() {
    await deleteSupplier(id)
    navigate('/suppliers')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 max-w-4xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition mb-6"
        >
          <ArrowLeft size={15} />
          返回廠商列表
        </button>

        {/* 廠商資訊卡 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-800">{supplier.name}</h1>
              {supplier.notes && (
                <p className="text-sm text-gray-400 mt-1">{supplier.notes}</p>
              )}
            </div>
            <button
              onClick={() => setEditModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition"
            >
              <Edit2 size={13} />
              編輯
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {supplier.contact && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User size={14} className="text-gray-400" />
                <span>{supplier.contact}</span>
              </div>
            )}
            {supplier.line && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <MessageCircle size={14} className="text-gray-400" />
                <span>{supplier.line}</span>
              </div>
            )}
            {supplier.website && (
              <a
                href={supplier.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-orange-500 hover:underline"
              >
                <Globe size={14} />
                <span>官方網站</span>
                <ExternalLink size={12} />
              </a>
            )}
            {supplier.orderUrl && (
              <a
                href={supplier.orderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-orange-500 hover:underline"
              >
                <ExternalLink size={14} />
                <span>訂單連結</span>
              </a>
            )}
          </div>

          {/* 統計 */}
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-gray-800">{orders.length}</div>
              <div className="text-xs text-gray-400">歷史訂單</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-800">
                {orders.reduce((s, o) => s + (o.items?.length || 0), 0)}
              </div>
              <div className="text-xs text-gray-400">訂購款數</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-800">
                NT${totalAmount.toLocaleString()}
              </div>
              <div className="text-xs text-gray-400">累計進貨金額</div>
            </div>
          </div>
        </div>

        {/* 歷史訂單 */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700">歷史訂單</h2>
          <Link
            to={`/orders/new?supplierId=${id}&supplierName=${encodeURIComponent(supplier.name)}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-xl text-sm hover:bg-orange-600 transition"
          >
            <Plus size={14} />
            新增訂單
          </Link>
        </div>

        {ordersLoading ? (
          <div className="text-center text-gray-400 py-10">載入中...</div>
        ) : orders.length === 0 ? (
          <div className="text-center text-gray-400 py-10">
            還沒有訂單紀錄
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map(o => (
              <Link
                key={o.id}
                to={`/orders/${o.id}`}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between hover:shadow-md transition"
              >
                <div>
                  <div className="font-medium text-gray-800">{o.orderDate}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {o.items?.length || 0} 款遊戲
                    {o.totalAmount ? `・NT$${o.totalAmount.toLocaleString()}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    o.synced ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'
                  }`}>
                    {o.synced ? '已匯入倉儲' : '待確認'}
                  </span>
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {editModal && (
        <SupplierModal
          supplier={supplier}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditModal(false)}
        />
      )}
    </div>
  )
}
