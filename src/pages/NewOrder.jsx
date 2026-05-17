import { useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Upload, FileSpreadsheet, FileText, Trash2, Check, AlertCircle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useSuppliers } from '../hooks/useSuppliers'
import { useOrders } from '../hooks/useOrders'
import { db } from '../firebase/config'
import {
  collection, getDocs, query, where, addDoc, updateDoc, doc, increment
} from 'firebase/firestore'

// 嘗試自動識別 Excel 欄位
function detectColumn(headers, keywords) {
  return headers.findIndex(h =>
    keywords.some(k => String(h).toLowerCase().includes(k.toLowerCase()))
  )
}

function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (rows.length < 2) return resolve([])

        const headers = rows[0].map(String)
        const nameIdx = detectColumn(headers, ['名稱', 'name', '品名', '遊戲', '商品'])
        const priceIdx = detectColumn(headers, ['定價', '售價', 'price', '原價'])
        const costIdx = detectColumn(headers, ['進價', '成本', 'cost', '進貨'])
        const qtyIdx = detectColumn(headers, ['數量', 'qty', 'quantity', '訂購'])

        const items = rows.slice(1).filter(r => r[nameIdx]).map(r => ({
          name: String(r[nameIdx] || '').trim(),
          price: Number(r[priceIdx]) || 0,
          cost: Number(r[costIdx]) || 0,
          qty: Number(r[qtyIdx]) || 1,
        })).filter(i => i.name)

        resolve(items)
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

async function parseText(text) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('未設定 ANTHROPIC_API_KEY')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `請從以下訂單文字中擷取遊戲清單，回傳 JSON 陣列，格式如下（只回傳 JSON，不要其他說明）：
[{"name":"遊戲名稱","price":定價數字,"cost":進價數字,"qty":數量數字}]

若某欄位找不到資訊，price/cost 填 0，qty 填 1。

訂單文字：
${text}`,
      }],
    }),
  })

  if (!res.ok) throw new Error(`API 錯誤: ${res.status}`)
  const data = await res.json()
  const content = data.content[0].text.trim()
  const jsonStr = content.match(/\[[\s\S]*\]/)?.[0]
  if (!jsonStr) throw new Error('無法解析回傳內容')
  return JSON.parse(jsonStr)
}

async function syncToInventory(items) {
  const results = { added: 0, updated: 0, errors: [] }
  for (const item of items) {
    try {
      const q = query(collection(db, 'inventory'), where('name', '==', item.name))
      const snap = await getDocs(q)
      if (snap.empty) {
        await addDoc(collection(db, 'inventory'), {
          name: item.name,
          price: item.price,
          cost: item.cost,
          stock: item.qty,
          players: '',
          minAge: '',
          rental: 0,
          imageUrl: '',
          createdAt: Date.now(),
        })
        results.added++
      } else {
        const ref = doc(db, 'inventory', snap.docs[0].id)
        await updateDoc(ref, {
          ...(item.price > 0 && { price: item.price }),
          ...(item.cost > 0 && { cost: item.cost }),
          stock: increment(item.qty),
        })
        results.updated++
      }
    } catch (err) {
      results.errors.push(item.name)
    }
  }
  return results
}

export default function NewOrder() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { suppliers } = useSuppliers()
  const { addOrder } = useOrders()
  const fileRef = useRef()

  const initSupplierId = searchParams.get('supplierId') || ''
  const initSupplierName = searchParams.get('supplierName') || ''

  const [step, setStep] = useState(1) // 1:上傳 2:確認 3:完成
  const [supplierId, setSupplierId] = useState(initSupplierId)
  const [supplierName, setSupplierName] = useState(initSupplierName)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10))
  const [items, setItems] = useState([])
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [fileName, setFileName] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  const selectedSupplier = suppliers.find(s => s.id === supplierId)

  async function handleFile(file) {
    if (!file) return
    setFileName(file.name)
    setParsing(true)
    setParseError('')
    try {
      let parsed
      if (file.name.match(/\.(xlsx|xls)$/i)) {
        parsed = await parseExcel(file)
      } else {
        const text = await file.text()
        parsed = await parseText(text)
      }
      if (!parsed.length) throw new Error('解析結果為空，請確認檔案格式')
      setItems(parsed)
      setStep(2)
    } catch (err) {
      setParseError(err.message || '解析失敗')
    } finally {
      setParsing(false)
    }
  }

  function updateItem(idx, key, val) {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, [key]: key === 'name' ? val : Number(val) || 0 } : item
    ))
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function addBlankItem() {
    setItems(prev => [...prev, { name: '', price: 0, cost: 0, qty: 1 }])
  }

  const totalAmount = items.reduce((s, i) => s + (i.cost || 0) * (i.qty || 1), 0)

  async function handleConfirm() {
    if (!items.length) return
    setSyncing(true)
    try {
      const result = await syncToInventory(items)
      const orderId = await addOrder({
        supplierId: supplierId || '',
        supplierName: supplierName || selectedSupplier?.name || '',
        orderDate,
        items,
        totalAmount,
        synced: true,
      })

      // 更新廠商的最後訂貨日
      if (supplierId) {
        await updateDoc(doc(db, 'suppliers', supplierId), { lastOrderDate: orderDate })
      }

      setSyncResult(result)
      setStep(3)
    } catch (err) {
      setParseError(err.message)
    } finally {
      setSyncing(false)
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

        <h1 className="text-xl font-bold text-gray-800 mb-6">新增訂單</h1>

        {/* Step 1：上傳 */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-semibold text-gray-700 mb-4">訂單資訊</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">廠商</label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                    value={supplierId}
                    onChange={e => {
                      setSupplierId(e.target.value)
                      const s = suppliers.find(s => s.id === e.target.value)
                      setSupplierName(s?.name || '')
                    }}
                  >
                    <option value="">（未指定）</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">訂貨日期</label>
                  <input
                    type="date"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                    value={orderDate}
                    onChange={e => setOrderDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-semibold text-gray-700 mb-4">上傳訂單檔案</h2>
              <div
                onClick={() => fileRef.current.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50 transition"
              >
                {parsing ? (
                  <div className="text-gray-500">
                    <div className="animate-spin text-3xl mb-2">⏳</div>
                    <p className="text-sm">解析中...</p>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-center gap-4 mb-3">
                      <FileSpreadsheet size={32} className="text-green-400" />
                      <FileText size={32} className="text-blue-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-600">點擊選擇或拖放檔案</p>
                    <p className="text-xs text-gray-400 mt-1">支援 .xlsx、.xls、.txt、.csv</p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.txt,.csv"
                className="hidden"
                onChange={e => handleFile(e.target.files[0])}
              />
              {parseError && (
                <div className="mt-3 flex items-center gap-2 text-sm text-red-500">
                  <AlertCircle size={15} />
                  {parseError}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2：確認 */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm text-gray-500">
                  廠商：<span className="font-medium text-gray-700">{supplierName || '未指定'}</span>
                  　日期：<span className="font-medium text-gray-700">{orderDate}</span>
                </div>
                <span className="text-xs text-gray-400">{fileName}</span>
              </div>
              <div className="text-xs text-gray-400">共 {items.length} 款，進貨總額 NT${totalAmount.toLocaleString()}</div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="grid grid-cols-12 text-xs font-medium text-gray-400 bg-gray-50 px-4 py-2 border-b border-gray-100">
                <div className="col-span-5">遊戲名稱</div>
                <div className="col-span-2 text-right">定價</div>
                <div className="col-span-2 text-right">進價</div>
                <div className="col-span-2 text-right">數量</div>
                <div className="col-span-1"></div>
              </div>
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 items-center px-4 py-2 border-b border-gray-50 hover:bg-gray-50 transition">
                  <div className="col-span-5 pr-2">
                    <input
                      className="w-full text-sm text-gray-800 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-orange-400 focus:outline-none py-0.5"
                      value={item.name}
                      onChange={e => updateItem(idx, 'name', e.target.value)}
                    />
                  </div>
                  {['price', 'cost', 'qty'].map(key => (
                    <div key={key} className="col-span-2 pr-2">
                      <input
                        type="number"
                        min="0"
                        className="w-full text-sm text-right text-gray-700 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-orange-400 focus:outline-none py-0.5"
                        value={item[key]}
                        onChange={e => updateItem(idx, key, e.target.value)}
                      />
                    </div>
                  ))}
                  <div className="col-span-1 text-right">
                    <button
                      onClick={() => removeItem(idx)}
                      className="p-1 text-gray-300 hover:text-red-400 transition"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="px-4 py-2">
                <button
                  onClick={addBlankItem}
                  className="text-xs text-orange-500 hover:text-orange-600 transition"
                >
                  + 新增一行
                </button>
              </div>
            </div>

            {parseError && (
              <div className="flex items-center gap-2 text-sm text-red-500">
                <AlertCircle size={15} />
                {parseError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setStep(1); setItems([]); setFileName('') }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition"
              >
                重新上傳
              </button>
              <button
                onClick={handleConfirm}
                disabled={syncing || !items.filter(i => i.name).length}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition disabled:opacity-50"
              >
                {syncing ? '匯入中...' : '確認並匯入倉儲'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3：完成 */}
        {step === 3 && syncResult && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-green-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">匯入完成！</h2>
            <div className="text-sm text-gray-500 space-y-1">
              <p>新增 <span className="font-semibold text-gray-700">{syncResult.added}</span> 款遊戲</p>
              <p>更新 <span className="font-semibold text-gray-700">{syncResult.updated}</span> 款庫存</p>
              {syncResult.errors.length > 0 && (
                <p className="text-red-500">失敗 {syncResult.errors.length} 款：{syncResult.errors.join('、')}</p>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => navigate('/orders')}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition"
              >
                查看歷史訂單
              </button>
              <button
                onClick={() => navigate('/inventory')}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition"
              >
                查看倉儲
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
