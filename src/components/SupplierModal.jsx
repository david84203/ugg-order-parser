import { useState } from 'react'
import { X } from 'lucide-react'

const empty = { name: '', contact: '', line: '', website: '', orderUrl: '', notes: '' }

export default function SupplierModal({ supplier, onSave, onDelete, onClose }) {
  const isEdit = !!supplier
  const [form, setForm] = useState(isEdit ? {
    name: supplier.name || '',
    contact: supplier.contact || '',
    line: supplier.line || '',
    website: supplier.website || '',
    orderUrl: supplier.orderUrl || '',
    notes: supplier.notes || '',
  } : empty)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await onSave({ ...form, name: form.name.trim() })
      onClose()
    } catch (err) {
      console.error('儲存廠商失敗:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await onDelete(supplier.id)
      onClose()
    } catch (err) {
      console.error('刪除廠商失敗:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">{isEdit ? '編輯廠商' : '新增廠商'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {[
            { key: 'name', label: '廠商名稱 *', placeholder: '例：新天鵝堡' },
            { key: 'contact', label: '聯絡人', placeholder: '業務姓名' },
            { key: 'line', label: 'LINE 名稱 / 群組名', placeholder: '例：Swan 業務群' },
            { key: 'website', label: '廠商官網', placeholder: 'https://...' },
            { key: 'orderUrl', label: '訂單連結', placeholder: 'Google 試算表或訂單頁面' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                value={form[key]}
                onChange={e => set(key, e.target.value)}
                placeholder={placeholder}
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">備註</label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-none"
              rows={3}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="自由填寫..."
            />
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-2">
          {isEdit && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-3 py-2 rounded-xl border border-red-200 text-red-500 text-sm hover:bg-red-50 transition"
            >
              刪除
            </button>
          )}
          {confirmDelete && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="px-3 py-2 rounded-xl bg-red-500 text-white text-sm hover:bg-red-600 transition disabled:opacity-50"
            >
              確定刪除
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="flex-1 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition disabled:opacity-50"
          >
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  )
}
