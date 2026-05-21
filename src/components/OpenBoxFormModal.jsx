import { useState, useRef } from 'react'
import { X, Search, Loader2, ImagePlus, ChevronDown, ChevronUp } from 'lucide-react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../firebase/config'

function calcRental(price) {
  const p = Number(price) || 0
  return p > 0 ? Math.ceil(p / 500) * 50 : 0
}

const emptyExtra = {
  players: '', lang: '', location: '', bggUrl: '',
  category: '', tag1: '', tag2: '', tag3: '', sticker: '', youtubeLink: '',
  englishName: '', bggRating: '', bestPlayers: '', playTime: '', complexity: '',
}

const PLAYER_MODES = ['輕鬆', '動腦', '超燒腦']

const EXTRA_FIELDS = [
  { key: 'lang',        label: '語言版本', placeholder: '例：繁中' },
  { key: 'location',    label: '放置櫃位', placeholder: '例：A3' },
  { key: 'category',    label: '分類',     placeholder: '例：策略' },
  { key: 'sticker',     label: '貼紙',     placeholder: '例：綠' },
  { key: 'tag1',        label: '標籤 1',   placeholder: '' },
  { key: 'tag2',        label: '標籤 2',   placeholder: '' },
  { key: 'tag3',        label: '標籤 3',   placeholder: '' },
  { key: 'youtubeLink', label: '教學連結', placeholder: 'YouTube 網址', span2: true },
  { key: 'source',      label: '來源',     placeholder: '例：XIAN在玩桌遊', span2: true },
]

export default function OpenBoxFormModal({ item, itemLabel, hasNext, onSave, onSaveNext, onCancel }) {
  const [form, setForm] = useState({ ...emptyExtra, price: item.price || '', cost: item.cost || '' })
  const [bggInput, setBggInput] = useState('')
  const [bggData, setBggData] = useState(null)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [showExtra, setShowExtra] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef()

  const price = Number(form.price) || 0
  const cost = Number(form.cost) || 0
  const rental = calcRental(price)

  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleFetchBgg() {
    if (!bggInput.trim()) return
    setFetching(true)
    setFetchError('')
    setBggData(null)
    try {
      const res = await fetch('/api/fetch-bgg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: bggInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setFetchError(data.error || '查詢失敗'); return }
      setBggData(data)
      setForm(f => ({
        ...f,
        players: data.players || f.players,
        englishName: data.englishName || f.englishName,
        bggRating: data.bggRating != null ? String(data.bggRating) : f.bggRating,
        bestPlayers: data.bestPlayers || f.bestPlayers,
        playTime: data.playTime != null ? String(data.playTime) : f.playTime,
        complexity: data.complexity != null ? String(data.complexity) : f.complexity,
        bggUrl: bggInput.trim(),
      }))
    } catch {
      setFetchError('網路錯誤，請稍後再試')
    } finally {
      setFetching(false)
    }
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSave() {
    setUploading(true)
    setUploadError('')
    try {
      let imageUrl = ''
      if (imageFile) {
        const ext = imageFile.name.split('.').pop()
        const path = `rental-games/${Date.now()}_${item.name}.${ext}`
        const storageRef = ref(storage, path)
        await uploadBytes(storageRef, imageFile)
        imageUrl = await getDownloadURL(storageRef)
      }
      onSave({ ...form, price: price || item.price || 0, cost: cost || item.cost || 0, rental, imageUrl })
    } catch (err) {
      setUploadError('圖片上傳失敗：' + err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">
              開盒遊戲資料
              {itemLabel && <span className="ml-2 text-xs font-normal text-orange-400">{itemLabel}</span>}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{item.name}</p>
          </div>
          <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600 transition">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* BGG 查詢 */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-600 mb-3">BGG 資料查詢</h3>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400 bg-white"
                placeholder="貼上 BGG 連結，例：boardgamegeek.com/boardgame/…"
                value={bggInput}
                onChange={e => setBggInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFetchBgg()}
              />
              <button
                onClick={handleFetchBgg}
                disabled={fetching || !bggInput.trim()}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition disabled:opacity-50"
              >
                {fetching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                查詢
              </button>
            </div>
            {fetchError && <p className="mt-2 text-xs text-red-500">{fetchError}</p>}
            {bggData && (
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {[
                  ['英文名稱', bggData.englishName],
                  ['人數', bggData.players],
                  ['BGG 評分', bggData.bggRating != null ? Number(bggData.bggRating).toFixed(1) : null],
                  ['最佳人數', bggData.bestPlayers],
                  ['遊戲時間', bggData.playTime ? `${bggData.playTime} 分` : null],
                  ['複雜度', bggData.complexity ? `${Number(bggData.complexity).toFixed(2)} / 5` : null],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="flex gap-1">
                    <span className="text-gray-400">{label}</span>
                    <span className="text-gray-700 font-medium">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 基本資料 */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-600">基本資料</h3>
            <div>
              <label className="block text-xs text-gray-500 mb-1">中文名稱 *</label>
              <input
                className="w-full border border-gray-100 bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-500"
                value={item.name}
                readOnly
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">人數</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                value={form.players}
                onChange={e => set('players', e.target.value)}
                placeholder="例：2-5（BGG 查詢自動填入）"
              />
            </div>
          </div>

          {/* 遊戲圖片 */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-xs font-semibold text-gray-600 mb-3">遊戲圖片</h3>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            {imagePreview ? (
              <div className="relative w-full">
                <img src={imagePreview} alt="預覽" className="w-full max-h-40 object-contain rounded-xl border border-gray-100 bg-gray-50" />
                <button onClick={clearImage} className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full shadow flex items-center justify-center hover:bg-red-50 transition">
                  <X size={14} className="text-gray-500" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full h-24 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-orange-300 hover:text-orange-400 transition"
              >
                <ImagePlus size={22} />
                <span className="text-xs">點擊上傳圖片</span>
              </button>
            )}
          </div>

          {/* 定價 */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-xs font-semibold text-gray-600 mb-3">定價</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">售價（NT$）</label>
                <input
                  type="number" min="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                  value={form.price}
                  onChange={e => set('price', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">進價（NT$）</label>
                <input
                  type="number" min="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                  value={form.cost}
                  onChange={e => set('cost', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">租金（自動）</label>
                <div className="w-full border border-gray-100 bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-600">
                  {rental > 0 ? `NT$ ${rental}` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* 其他資訊（選填） */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <button type="button"
              onClick={() => setShowExtra(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition"
            >
              <span>其他資訊 <span className="font-normal text-gray-400">（選填）</span></span>
              {showExtra ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
            </button>
            {showExtra && (
              <div className="px-4 pb-4 pt-3 grid grid-cols-2 gap-3 border-t border-gray-100">
                {/* 玩家模式 */}
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1.5">玩家模式</label>
                  <div className="flex gap-2">
                    {PLAYER_MODES.map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => set('playerMode', form.playerMode === mode ? '' : mode)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition border ${
                          form.playerMode === mode
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                {EXTRA_FIELDS.map(f => (
                  <div key={f.key} className={f.span2 ? 'col-span-2' : ''}>
                    <label className="block text-xs text-gray-400 mb-1">{f.label}</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-orange-400"
                      value={form[f.key]}
                      onChange={e => set(f.key, e.target.value)}
                      placeholder={f.placeholder}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition">
            取消
          </button>
          {hasNext && onSaveNext && (
            <button
              onClick={async () => {
                setUploading(true)
                try {
                  let imageUrl = ''
                  if (imageFile) {
                    const ext = imageFile.name.split('.').pop()
                    const storageRef = ref(storage, `rental-games/${Date.now()}_${item.name}.${ext}`)
                    await uploadBytes(storageRef, imageFile)
                    imageUrl = await getDownloadURL(storageRef)
                  }
                  onSaveNext({ ...form, price: price || item.price || 0, cost: cost || item.cost || 0, rental, imageUrl })
                } catch (err) {
                  setUploadError('圖片上傳失敗：' + err.message)
                } finally {
                  setUploading(false)
                }
              }}
              disabled={uploading}
              className="flex-1 py-2.5 rounded-xl border border-orange-400 text-orange-600 text-sm font-medium hover:bg-orange-50 transition disabled:opacity-50"
            >
              儲存並填下一款 →
            </button>
          )}
          <button onClick={handleSave} disabled={uploading}
            className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {uploading
              ? <><Loader2 size={14} className="animate-spin" /> 上傳中...</>
              : '確認'}
          </button>
        </div>
      </div>
    </div>
  )
}
