import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { useOrders } from '../hooks/useOrders'
import { db } from '../firebase/config'
import { deleteDoc, doc } from 'firebase/firestore'

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getOrder } = useOrders()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    getOrder(id).then(o => { setOrder(o); setLoading(false) })
  }, [id])

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">載入中...</div>
  if (!order) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">找不到訂單</div>

  const totalCost = order.items?.reduce((s, i) => s + (i.cost || 0) * (i.qty || 1), 0) || 0

  async function handleDelete() {
    if (!confirm('確定要刪除這筆訂單紀錄嗎？（庫存數量不會自動回復，請手動調整）')) return
    setDeleting(true)
    await deleteDoc(doc(db, 'orders', id))
    navigate('/orders')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 max-w-3xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition mb-6"
        >
          <ArrowLeft size={15} />
          返回
        </button>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-800">{order.supplierName || '未指定廠商'}</h1>
              <p className="text-sm text-gray-400 mt-0.5">訂貨日期：{order.orderDate}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded-full ${
                order.synced ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'
              }`}>
                {order.synced ? '已匯入倉儲' : '待確認'}
              </span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition px-2 py-1 rounded-lg hover:bg-red-50"
              >
                <Trash2 size={13} />
                刪除
              </button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 text-center pt-4 border-t border-gray-100">
            <div>
              <div className="text-xl font-bold text-gray-800">{order.items?.length || 0}</div>
              <div className="text-xs text-gray-400">款遊戲</div>
            </div>
            <div>
              <div className="text-xl font-bold text-gray-800">
                {order.items?.reduce((s, i) => s + (i.qty || 1), 0) || 0}
              </div>
              <div className="text-xs text-gray-400">總件數</div>
            </div>
            <div>
              <div className="text-xl font-bold text-gray-800">NT${totalCost.toLocaleString()}</div>
              <div className="text-xs text-gray-400">進貨總額</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="grid grid-cols-12 text-xs font-medium text-gray-400 bg-gray-50 px-4 py-2 border-b border-gray-100">
            <div className="col-span-6">遊戲名稱</div>
            <div className="col-span-2 text-right">定價</div>
            <div className="col-span-2 text-right">進價</div>
            <div className="col-span-2 text-right">數量</div>
          </div>
          {(order.items || []).map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 items-center px-4 py-3 border-b border-gray-50 last:border-0">
              <div className="col-span-6 text-sm text-gray-800">{item.name}</div>
              <div className="col-span-2 text-sm text-right text-gray-600">
                {item.price ? `NT$${item.price.toLocaleString()}` : '—'}
              </div>
              <div className="col-span-2 text-sm text-right text-gray-600">
                {item.cost ? `NT$${item.cost.toLocaleString()}` : '—'}
              </div>
              <div className="col-span-2 text-sm text-right text-gray-600">{item.qty || 1}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
