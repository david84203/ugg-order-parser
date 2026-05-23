import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2, Plus, Check, X } from 'lucide-react'
import { useOrders } from '../hooks/useOrders'
import { db } from '../firebase/config'
import { deleteDoc, doc, updateDoc, collection, query, where, getDocs, addDoc, writeBatch, increment } from 'firebase/firestore'

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getOrder } = useOrders()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [appending, setAppending] = useState(false)
  const [appendRows, setAppendRows] = useState([{ name: '', price: 0, cost: 0, qty: 1, isFreeGift: false }])
  const [appendSaving, setAppendSaving] = useState(false)
  const [appendError, setAppendError] = useState('')

  useEffect(() => {
    getOrder(id).then(o => { setOrder(o); setLoading(false) })
  }, [id])

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">載入中...</div>
  if (!order) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">找不到訂單</div>

  const totalCost = order.items?.reduce((s, i) => s + (i.cost || 0) * (i.qty || 1), 0) || 0

  function updateAppendRow(i, field, value) {
    setAppendRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r
      if (field === 'name') return { ...r, name: value }
      if (field === 'isFreeGift') return { ...r, isFreeGift: value, cost: value ? 0 : r.cost }
      return { ...r, [field]: Number(value) || 0 }
    }))
  }

  function addAppendRow() {
    setAppendRows(prev => [...prev, { name: '', price: 0, cost: 0, qty: 1, isFreeGift: false }])
  }

  function removeAppendRow(i) {
    setAppendRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleAppendSave() {
    const validRows = appendRows.filter(r => r.name.trim() && r.qty > 0)
    if (!validRows.length) { setAppendError('請至少填寫一筆品名與數量'); return }
    setAppendSaving(true)
    setAppendError('')
    try {
      // 同步庫存
      for (const item of validRows) {
        const q = query(collection(db, 'inventory'), where('name', '==', item.name.trim()))
        const snap = await getDocs(q)
        if (snap.empty) {
          await addDoc(collection(db, 'inventory'), {
            name: item.name.trim(),
            price: item.price,
            cost: item.cost,
            stock: item.qty,
            players: '', minAge: '', rental: 0, imageUrl: '',
            createdAt: Date.now(),
          })
        } else {
          await updateDoc(snap.docs[0].ref, {
            ...(item.price > 0 && { price: item.price }),
            ...(item.cost > 0 && { cost: item.cost }),
            stock: increment(item.qty),
          })
        }
      }
      // 更新訂單
      const newItems = [...(order.items || []), ...validRows.map(r => ({ name: r.name.trim(), price: r.price, cost: r.isFreeGift ? 0 : r.cost, qty: r.qty, isFreeGift: r.isFreeGift || false, isOpenBox: false }))]
      await updateDoc(doc(db, 'orders', id), { items: newItems })
      setOrder(prev => ({ ...prev, items: newItems }))
      setAppending(false)
      setAppendRows([{ name: '', price: 0, cost: 0, qty: 1 }])
    } catch (err) {
      setAppendError(err.message || '儲存失敗')
    } finally {
      setAppendSaving(false)
    }
  }

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
                onClick={() => { setAppending(v => !v); setAppendError('') }}
                className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 transition px-2 py-1 rounded-lg hover:bg-orange-50"
              >
                <Plus size={13} />
                補充品項
              </button>
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

        {appending && (
          <div className="bg-white rounded-2xl border border-orange-100 shadow-sm overflow-hidden mt-4">
            <div className="px-4 py-3 bg-orange-50 border-b border-orange-100 text-sm font-medium text-orange-700">補充品項</div>
            <div className="divide-y divide-gray-50">
              {appendRows.map((row, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center px-4 py-2">
                  <input
                    className="col-span-4 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-orange-400"
                    placeholder="遊戲名稱"
                    value={row.name}
                    onChange={e => updateAppendRow(i, 'name', e.target.value)}
                  />
                  <input type="number" min="0"
                    className="col-span-2 text-sm border border-gray-200 rounded-lg px-2 py-1 text-right focus:outline-none focus:border-orange-400"
                    placeholder="定價"
                    value={row.price === 0 ? '' : row.price}
                    onChange={e => updateAppendRow(i, 'price', e.target.value)}
                  />
                  {row.isFreeGift ? (
                    <div className="col-span-2 text-center text-xs text-green-600 font-medium bg-green-50 rounded-lg py-1.5">廠商贈送</div>
                  ) : (
                    <input type="number" min="0"
                      className="col-span-2 text-sm border border-gray-200 rounded-lg px-2 py-1 text-right focus:outline-none focus:border-orange-400"
                      placeholder="進價"
                      value={row.cost === 0 ? 0 : (row.cost || '')}
                      onChange={e => updateAppendRow(i, 'cost', e.target.value)}
                    />
                  )}
                  <input type="number" min="1"
                    className="col-span-2 text-sm border border-gray-200 rounded-lg px-2 py-1 text-right focus:outline-none focus:border-orange-400"
                    placeholder="數量"
                    value={row.qty || ''}
                    onChange={e => updateAppendRow(i, 'qty', e.target.value)}
                  />
                  <button
                    onClick={() => updateAppendRow(i, 'isFreeGift', !row.isFreeGift)}
                    className={`col-span-1 text-xs rounded px-1 py-1 transition ${row.isFreeGift ? 'bg-green-100 text-green-600' : 'text-gray-300 hover:text-green-500'}`}
                    title="廠商贈送"
                  >贈</button>
                  <button onClick={() => removeAppendRow(i)} className="col-span-1 text-gray-300 hover:text-red-400 flex justify-center">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="px-4 py-2 border-t border-gray-50 flex items-center justify-between">
              <button onClick={addAppendRow} className="text-xs text-orange-500 hover:text-orange-600">+ 新增一行</button>
              <div className="flex items-center gap-2">
                {appendError && <span className="text-xs text-red-500">{appendError}</span>}
                <button
                  onClick={() => { setAppending(false); setAppendRows([{ name: '', price: 0, cost: 0, qty: 1 }]); setAppendError('') }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg border border-gray-200"
                >取消</button>
                <button
                  onClick={handleAppendSave}
                  disabled={appendSaving}
                  className="flex items-center gap-1 text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600 disabled:opacity-50"
                >
                  <Check size={12} />
                  {appendSaving ? '儲存中...' : '確認補充'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
