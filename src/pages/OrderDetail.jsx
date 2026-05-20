import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { useOrders } from '../hooks/useOrders'
import { db } from '../firebase/config'
import { deleteDoc, doc, collection, query, where, getDocs, writeBatch, increment } from 'firebase/firestore'

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
    // 統計要扣回的庫存品項（非開盒）
    const inventoryItems = (order.items || []).filter(i => !i.isOpenBox)
    const openBoxItems = (order.items || []).filter(i => i.isOpenBox)

    const lines = inventoryItems.map(i => `・${i.name} ×${i.qty}`).join('\n')
    const openBoxNote = openBoxItems.length > 0
      ? `\n\n開盒遊戲 ${openBoxItems.length} 款不會異動（已寫入 Google Sheet）。`
      : ''

    const msg = inventoryItems.length > 0
      ? `刪除後將自動扣回以下庫存：\n${lines}${openBoxNote}\n\n確定刪除？`
      : `此訂單全為開盒遊戲，刪除只移除訂單紀錄。${openBoxNote}\n\n確定刪除？`

    if (!confirm(msg)) return
    setDeleting(true)

    try {
      // 扣回庫存
      if (inventoryItems.length > 0) {
        const batch = writeBatch(db)
        for (const item of inventoryItems) {
          const snap = await getDocs(
            query(collection(db, 'inventory'), where('name', '==', item.name))
          )
          if (!snap.empty) {
            batch.update(snap.docs[0].ref, { stock: increment(-(item.qty || 1)) })
          }
        }
        await batch.commit()
      }

      await deleteDoc(doc(db, 'orders', id))
      navigate('/orders')
    } catch (err) {
      alert('刪除失敗：' + err.message)
      setDeleting(false)
    }
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
