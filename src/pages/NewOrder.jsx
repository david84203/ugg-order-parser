import { useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Upload, FileSpreadsheet, FileText, Trash2, Check, AlertCircle } from 'lucide-react'
import OpenBoxFormModal from '../components/OpenBoxFormModal'
import * as XLSX from 'xlsx'
import { useSuppliers } from '../hooks/useSuppliers'
import { useOrders } from '../hooks/useOrders'
import { db } from '../firebase/config'
import { collection, getDocs, query, where, addDoc, updateDoc, doc, increment } from 'firebase/firestore'
import { parseOrderText, parseOrionText } from '../utils/orderParser'

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

        // 掃描所有工作表，找第一個有內容的 rows
        let rows = []
        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName]
          const r = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
          // 新天鵝堡訂購單：找含 Order Qty + Name Chinese 的 sheet
          if (r.some(row => row.some(c => String(c) === 'Order Qty') && row.some(c => String(c) === 'Name Chinese'))) {
            rows = r
            break
          }
          // 其他格式：第一個有足夠資料的 sheet
          if (!rows.length && r.length >= 2) rows = r
        }
        if (rows.length < 2) return resolve([])

        // 新天鵝堡格式：有 "Order Qty" + "Name Chinese" + "MSRP" 的表頭列
        const swanHeaderIdx = rows.findIndex(row =>
          row.some(c => String(c) === 'Order Qty') &&
          row.some(c => String(c) === 'Name Chinese')
        )
        if (swanHeaderIdx !== -1) {
          const h = rows[swanHeaderIdx].map(String)
          const nameIdx = h.indexOf('Name Chinese')
          const priceIdx = h.indexOf('MSRP')
          const samplePctIdx = h.indexOf('Sample%')   // 樣品折數
          const discountIdx = h.indexOf('Discount')    // 新品折數
          const orderQtyCols = h.reduce((acc, v, i) => v === 'Order Qty' ? [...acc, i] : acc, [])
          const sampleIdx = orderQtyCols[0] // 樣品數量
          const newIdx = orderQtyCols[1]    // 新品數量
          const items = rows.slice(swanHeaderIdx + 2)
            .filter(r => r[nameIdx])
            .flatMap(r => {
              const msrp = Number(r[priceIdx]) || 0
              const sQty = Number(r[sampleIdx]) || 0
              const nQty = Number(r[newIdx]) || 0
              const sPct = Number(r[samplePctIdx]) || 0
              const dPct = Number(r[discountIdx]) || 0
              const sRate = sPct || dPct
              const nRate = dPct || sPct
              const name = String(r[nameIdx] || '').trim()
              if (!name || msrp === 0 || (sQty + nQty) === 0) return []
              const result = []
              // 樣品 → 開盒遊戲（isOpenBox: true）
              if (sQty > 0) result.push({ name, price: msrp, cost: Math.round(msrp * sRate), qty: sQty, isOpenBox: true })
              // 新品 → 一般庫存
              if (nQty > 0) result.push({ name, price: msrp, cost: Math.round(msrp * nRate), qty: nQty, isOpenBox: false })
              return result
            })
          return resolve(items)
        }

        // 狗吠火車格式：有「新品數量」和「樣品數量」欄位
        const dogHeaderIdx = rows.findIndex(row =>
          row.some(c => String(c).trim() === '新品數量') &&
          row.some(c => String(c).trim() === '樣品數量')
        )
        if (dogHeaderIdx !== -1) {
          const h = rows[dogHeaderIdx].map(c => String(c).trim())
          const nameIdx = h.indexOf('遊戲名稱')
          const priceIdx = h.indexOf('定價')
          const costIdx = h.indexOf('價格')
          const sampleCostIdx = h.indexOf('樣品價')
          const sQtyIdx = h.indexOf('樣品數量')
          const nQtyIdx = h.indexOf('新品數量')
          const dogItems = rows.slice(dogHeaderIdx + 1)
            .filter(r => r[nameIdx])
            .flatMap(r => {
              const name = String(r[nameIdx] || '').trim()
              if (!name) return []
              const msrp = Number(r[priceIdx]) || 0
              const newCost = Number(r[costIdx]) || 0
              const sampleCost = Number(r[sampleCostIdx]) || newCost
              const sQty = Number(r[sQtyIdx]) || 0
              const nQty = Number(r[nQtyIdx]) || 0
              if (sQty + nQty === 0) return []
              const result = []
              if (sQty > 0) result.push({ name, price: msrp, cost: sampleCost, qty: sQty, isOpenBox: true })
              if (nQty > 0) result.push({ name, price: msrp, cost: newCost, qty: nQty, isOpenBox: false })
              return result
            })
          return resolve(dogItems)
        }

        // 通用格式
        const headers = rows[0].map(String)
        const nameIdx = detectColumn(headers, ['名稱', 'name', '品名', '遊戲'])
        const priceIdx = detectColumn(headers, ['定價', '售價', 'price', '原價', '零售'])
        const costIdx = detectColumn(headers, ['進價', '成本', 'cost', '進貨', '單價', '批發'])
        const qtyIdx = detectColumn(headers, ['數量', 'qty', 'quantity', '訂購', '訂量'])

        const items = rows.slice(1).filter(r => r[nameIdx]).map(r => ({
          name: String(r[nameIdx] || '').trim(),
          price: Number(r[priceIdx]) || 0,
          cost: Number(r[costIdx]) || 0,
          qty: Number(r[qtyIdx]) || 0,
          isOpenBox: false,
        })).filter(i => i.name && i.qty > 0)

        resolve(items)
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

async function syncToInventory(items) {
  const results = { added: 0, updated: 0, errors: [] }
  for (const item of items) {
    try {
      const q = query(collection(db, 'inventory'), where('name', '==', item.name))
      const snap = await getDocs(q)
      if (snap.empty) {
        const p = item.price || 0
        await addDoc(collection(db, 'inventory'), {
          name: item.name,
          price: item.price,
          cost: item.cost,
          stock: item.qty,
          players: '',
          minAge: '',
          rental: p > 0 ? Math.ceil(p / 500) * 50 : 0,
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
    } catch {
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
  const pdfRef = useRef()

  const initSupplierId = searchParams.get('supplierId') || ''
  const initSupplierName = searchParams.get('supplierName') || ''

  const [inputTab, setInputTab] = useState('text') // 'text' | 'pdf' | 'file'
  const [step, setStep] = useState(1)
  const [supplierId, setSupplierId] = useState(initSupplierId)
  const [supplierName, setSupplierName] = useState(initSupplierName)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10))
  const [rawText, setRawText] = useState('')
  const [items, setItems] = useState([])
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [fileName, setFileName] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [openBoxModal, setOpenBoxModal] = useState({ open: false, itemIdx: null })

  const selectedSupplier = suppliers.find(s => s.id === supplierId)

  function handleTextParse() {
    setParseError('')
    const parsed = parseOrderText(rawText)
    if (!parsed.length) {
      setParseError('找不到可解析的品項，請確認格式是否正確（玩坊格式）。')
      return
    }
    // 玩坊格式：msrp → price, unitCost → cost
    setItems(parsed.map(i => ({ name: i.name, price: i.msrp, cost: i.unitCost, qty: i.qty, isOpenBox: false })))
    setFileName('玩坊文字訂單')
    setStep(2)
  }

  async function handleFile(file) {
    if (!file) return
    setFileName(file.name)
    setParsing(true)
    setParseError('')
    try {
      const parsed = await parseExcel(file)
      if (!parsed.length) throw new Error('解析結果為空，請確認檔案格式')
      setItems(parsed)
      setStep(2)
    } catch (err) {
      setParseError(err.message || '解析失敗')
    } finally {
      setParsing(false)
    }
  }

  async function handlePdf(file) {
    if (!file) return
    setFileName(file.name)
    setParsing(true)
    setParseError('')
    try {
      const { extractPdfText } = await import('../utils/pdfParser')
      const text = await extractPdfText(file)
      const parsed = parseOrionText(text)
      if (!parsed.length) throw new Error('找不到可解析的品項，請確認為 Orion 報價單格式。')
      setItems(parsed.map(i => ({ name: i.name, price: i.msrp, cost: i.unitCost, qty: i.qty, isOpenBox: false })))
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

  function toggleOpenBox(idx) {
    const item = items[idx]
    if (!item.isOpenBox) {
      setItems(prev => prev.map((it, i) => i === idx ? { ...it, isOpenBox: true } : it))
      setOpenBoxModal({ open: true, itemIdx: idx })
    } else {
      setItems(prev => prev.map((it, i) => i === idx ? { ...it, isOpenBox: false, openBoxData: null } : it))
    }
  }

  function openBoxEdit(idx) {
    setOpenBoxModal({ open: true, itemIdx: idx })
  }

  function handleOpenBoxSave(formData) {
    const idx = openBoxModal.itemIdx
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, openBoxData: formData } : it))
    setOpenBoxModal({ open: false, itemIdx: null })
  }

  function handleOpenBoxSaveNext(formData) {
    const idx = openBoxModal.itemIdx
    const updated = items.map((it, i) => i === idx ? { ...it, openBoxData: formData } : it)
    setItems(updated)
    const nextIdx = updated.findIndex((it, i) => i > idx && it.isOpenBox && !it.openBoxData)
    if (nextIdx !== -1) setOpenBoxModal({ open: true, itemIdx: nextIdx })
    else setOpenBoxModal({ open: false, itemIdx: null })
  }

  function handleOpenBoxCancel() {
    const idx = openBoxModal.itemIdx
    // 若是新勾選（尚未有 openBoxData）才取消勾選；已有資料的只是關閉
    if (!items[idx]?.openBoxData) {
      setItems(prev => prev.map((it, i) => i === idx ? { ...it, isOpenBox: false, openBoxData: null } : it))
    }
    setOpenBoxModal({ open: false, itemIdx: null })
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function addBlankItem() {
    setItems(prev => [...prev, { name: '', price: 0, cost: 0, qty: 1, isOpenBox: false }])
  }

  const inventoryItems = items.filter(i => !i.isOpenBox)
  const openBoxItems = items.filter(i => i.isOpenBox)
  // 開盒遊戲只算 1 盒成本，剩餘 qty-1 算進庫存成本
  const inventoryCost = inventoryItems.reduce((s, i) => s + (i.cost || 0) * (i.qty || 1), 0)
    + openBoxItems.reduce((s, i) => s + (i.cost || 0) * Math.max(0, (i.qty || 1) - 1), 0)
  const openBoxCost = openBoxItems.reduce((s, i) => s + (i.cost || 0), 0)
  const totalAmount = inventoryCost + openBoxCost

  async function handleConfirm() {
    if (!items.filter(i => i.name).length) return
    setSyncing(true)
    setParseError('')
    try {
      // 庫存同步：非開盒的全部 + 開盒遊戲剩餘 qty-1 盒
      const inventorySyncItems = [
        ...inventoryItems,
        ...openBoxItems.filter(i => (i.qty || 1) > 1).map(i => ({ ...i, qty: i.qty - 1 })),
      ]
      let result = { added: 0, updated: 0, errors: [] }
      if (inventorySyncItems.length > 0) {
        result = await syncToInventory(inventorySyncItems)
      }

      // 開盒 → Google Sheet（每款只寫 1 盒，帶入 Modal 填入的完整資料）
      if (openBoxItems.length > 0) {
        const res = await fetch('/api/write-sheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(openBoxItems.map(({ name, price, openBoxData }) => ({
            name,
            msrp: openBoxData?.price || price,
            players: openBoxData?.players || '',
            lang: openBoxData?.lang || '',
            location: openBoxData?.location || '',
            bggUrl: openBoxData?.bggUrl || '',
            category: openBoxData?.category || '',
            tag1: openBoxData?.tag1 || '',
            tag2: openBoxData?.tag2 || '',
            tag3: openBoxData?.tag3 || '',
            sticker: openBoxData?.sticker || '',
            imageUrl: openBoxData?.imageUrl || '',
            youtubeLink: openBoxData?.youtubeLink || '',
            source: openBoxData?.source || '',
            playerMode: openBoxData?.playerMode || '',
            rental: openBoxData?.rental || '',
            englishName: openBoxData?.englishName || '',
            bggRating: openBoxData?.bggRating || '',
            bestPlayers: openBoxData?.bestPlayers || '',
            playTime: openBoxData?.playTime || '',
            complexity: openBoxData?.complexity || '',
          }))),
        })
        if (!res.ok) throw new Error('Google Sheet 寫入失敗')
      }

      await addOrder({
        supplierId: supplierId || '',
        supplierName: supplierName || selectedSupplier?.name || '',
        orderDate,
        items,
        totalAmount,
        inventoryCost,
        openBoxCost,
        openBoxCount: openBoxItems.length,
        synced: true,
      })

      if (supplierId) {
        await updateDoc(doc(db, 'suppliers', supplierId), { lastOrderDate: orderDate })
      }

      setSyncResult({ ...result, openBoxAdded: openBoxItems.length })
      setStep(3)
    } catch (err) {
      setParseError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  function resetStep1() {
    setStep(1)
    setItems([])
    setFileName('')
    setRawText('')
    setParseError('')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {openBoxModal.open && openBoxModal.itemIdx !== null && (() => {
        const allOpenBoxIdxs = items.reduce((acc, it, i) => it.isOpenBox ? [...acc, i] : acc, [])
        const currentNum = allOpenBoxIdxs.indexOf(openBoxModal.itemIdx) + 1
        const totalNum = allOpenBoxIdxs.length
        const hasNext = items.findIndex((it, i) => i > openBoxModal.itemIdx && it.isOpenBox && !it.openBoxData) !== -1
        return (
          <OpenBoxFormModal
            key={openBoxModal.itemIdx}
            item={items[openBoxModal.itemIdx]}
            itemLabel={totalNum > 1 ? `第 ${currentNum} / ${totalNum} 款` : ''}
            hasNext={hasNext}
            onSave={handleOpenBoxSave}
            onSaveNext={handleOpenBoxSaveNext}
            onCancel={handleOpenBoxCancel}
          />
        )
      })()}
      <div className="p-6 max-w-3xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition mb-6"
        >
          <ArrowLeft size={15} />
          返回
        </button>

        <h1 className="text-xl font-bold text-gray-800 mb-6">新增訂單</h1>

        {/* Step 1：輸入 */}
        {step === 1 && (
          <div className="space-y-5">
            {/* 訂單資訊 */}
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

            {/* 輸入方式切換 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => { setInputTab('text'); setParseError('') }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
                    inputTab === 'text'
                      ? 'bg-orange-50 text-orange-600 border border-orange-200'
                      : 'text-gray-500 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <FileText size={14} /> 文字貼上
                  <span className="text-xs text-gray-400">（玩坊）</span>
                </button>
                <button
                  onClick={() => { setInputTab('pdf'); setParseError('') }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
                    inputTab === 'pdf'
                      ? 'bg-orange-50 text-orange-600 border border-orange-200'
                      : 'text-gray-500 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <FileText size={14} /> PDF 上傳
                  <span className="text-xs text-gray-400">（Orion）</span>
                </button>
                <button
                  onClick={() => { setInputTab('file'); setParseError('') }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
                    inputTab === 'file'
                      ? 'bg-orange-50 text-orange-600 border border-orange-200'
                      : 'text-gray-500 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Upload size={14} /> Excel 上傳
                  <span className="text-xs text-gray-400">（其他 / Orion）</span>
                </button>
              </div>

              {inputTab === 'text' && (
                <>
                  <textarea
                    className="w-full h-48 text-sm text-gray-700 border border-gray-200 rounded-xl p-3 resize-none focus:outline-none focus:border-orange-400"
                    placeholder="貼上玩坊訂單文字…"
                    value={rawText}
                    onChange={e => { setRawText(e.target.value); setParseError('') }}
                  />
                  <button
                    onClick={handleTextParse}
                    disabled={!rawText.trim()}
                    className="mt-3 px-5 py-2 bg-orange-500 text-white text-sm font-medium rounded-xl hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    解析訂單
                  </button>
                </>
              )}

              {inputTab === 'pdf' && (
                <div
                  onClick={() => pdfRef.current.click()}
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
                        <FileText size={32} className="text-red-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-600">點擊選擇 Orion 報價單 PDF</p>
                      <p className="text-xs text-gray-400 mt-1">支援 .pdf（華勝桌遊訂購單）</p>
                    </>
                  )}
                </div>
              )}

              {inputTab === 'file' && (
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
                      </div>
                      <p className="text-sm font-medium text-gray-600">點擊選擇或拖放檔案</p>
                      <p className="text-xs text-gray-400 mt-1">支援 .xlsx、.xls（新天鵝堡 / Orion 訂購單）</p>
                    </>
                  )}
                </div>
              )}

              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => handleFile(e.target.files[0])}
              />
              <input
                ref={pdfRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={e => handlePdf(e.target.files[0])}
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
              <div className="text-xs text-gray-400">共 {items.length} 款</div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="grid grid-cols-12 text-xs font-medium text-gray-400 bg-gray-50 px-4 py-2 border-b border-gray-100">
                <div className="col-span-4">遊戲名稱</div>
                <div className="col-span-2 text-right">定價</div>
                <div className="col-span-2 text-right">進價</div>
                <div className="col-span-1 text-right">數量</div>
                <div className="col-span-2 text-center">開盒遊戲<br/><span className="text-gray-300 normal-case font-normal">→寫入 Sheet</span></div>
                <div className="col-span-1"></div>
              </div>
              {items.map((item, idx) => (
                <div key={idx} className={`grid grid-cols-12 items-center px-4 py-2 border-b border-gray-50 transition ${item.isOpenBox ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                  <div className="col-span-4 pr-2">
                    <input
                      className="w-full text-sm text-gray-800 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-orange-400 focus:outline-none py-0.5"
                      value={item.name}
                      onChange={e => updateItem(idx, 'name', e.target.value)}
                    />
                  </div>
                  {['price', 'cost', 'qty'].map(key => (
                    <div key={key} className="col-span-2 pr-2 last:col-span-1">
                      <input
                        type="number"
                        min="0"
                        className="w-full text-sm text-right text-gray-700 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-orange-400 focus:outline-none py-0.5"
                        value={item[key]}
                        onChange={e => updateItem(idx, key, e.target.value)}
                      />
                    </div>
                  ))}
                  <div className="col-span-2 flex flex-col items-center gap-1">
                    <input
                      type="checkbox"
                      checked={item.isOpenBox}
                      onChange={() => toggleOpenBox(idx)}
                      className="w-4 h-4 accent-orange-500"
                    />
                    {item.isOpenBox && (
                      <button
                        onClick={() => openBoxEdit(idx)}
                        className={`text-xs px-2 py-0.5 rounded-lg transition ${
                          item.openBoxData
                            ? 'text-green-600 bg-green-50 hover:bg-green-100'
                            : 'text-orange-600 bg-orange-100 hover:bg-orange-200'
                        }`}
                      >
                        {item.openBoxData ? '✓ 已填' : '填寫 ▸'}
                      </button>
                    )}
                  </div>
                  <div className="col-span-1 text-right">
                    <button onClick={() => removeItem(idx)} className="p-1 text-gray-300 hover:text-red-400 transition">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="px-4 py-2">
                <button onClick={addBlankItem} className="text-xs text-orange-500 hover:text-orange-600 transition">
                  + 新增一行
                </button>
              </div>
            </div>

            {/* 成本摘要 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3">
              <div className="flex gap-6 text-xs text-gray-500">
                <span>庫存 <strong className="text-gray-700">{inventoryItems.length}</strong> 筆・NT$<strong className="text-gray-700">{inventoryCost.toLocaleString()}</strong></span>
                <span>開盒 <strong className="text-orange-600">{openBoxItems.length}</strong> 筆・NT$<strong className="text-orange-600">{openBoxCost.toLocaleString()}</strong></span>
                <span className="text-gray-400">合計 NT$<strong>{totalAmount.toLocaleString()}</strong></span>
              </div>
            </div>

            {parseError && (
              <div className="flex items-center gap-2 text-sm text-red-500">
                <AlertCircle size={15} />
                {parseError}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={resetStep1} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition">
                重新輸入
              </button>
              <button
                onClick={handleConfirm}
                disabled={syncing || !items.filter(i => i.name).length}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition disabled:opacity-50"
              >
                {syncing ? '匯入中...' : '確認並匯入'}
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
              <p>庫存新增 <strong className="text-gray-700">{syncResult.added}</strong> 款・更新 <strong className="text-gray-700">{syncResult.updated}</strong> 款</p>
              {syncResult.openBoxAdded > 0 && (
                <p>開盒遊戲 <strong className="text-orange-600">{syncResult.openBoxAdded}</strong> 款已寫入 Google Sheet</p>
              )}
              {syncResult.errors.length > 0 && (
                <p className="text-red-500">失敗 {syncResult.errors.length} 款：{syncResult.errors.join('、')}</p>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => navigate('/orders')} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition">
                查看歷史訂單
              </button>
              <button onClick={() => navigate('/inventory')} className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition">
                查看倉儲
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
