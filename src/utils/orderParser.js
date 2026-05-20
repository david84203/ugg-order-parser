/**
 * 解析新天鵝堡/代理商訂單文字
 * 支援格式：【品號】(備注) 品名 \n 數量.00 件 \n 原廠定價 \n 折扣價 \n 折扣%  NT$總金額
 */
export function parseOrderText(text) {
  const items = []
  const blocks = text.split(/(?=【)/).filter(b => b.trim().startsWith('【'))

  for (const block of blocks) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) continue

    // 品名：移除【XX】前綴，移除開頭的 (備注) 標記
    let name = lines[0].replace(/^【[^】]+】/, '').trim()
    name = name.replace(/^\([^)]+\)\s*/, '').trim()
    if (!name) continue

    // 數量：X.00 件
    const qtyMatch = block.match(/(\d+)\.00\s*件/)
    if (!qtyMatch) continue
    const qty = parseInt(qtyMatch[1])

    // 定價（原廠建議售價）：數量行後第一個 price.xx
    let msrp = 0
    const afterQty = block.slice(block.indexOf(qtyMatch[0]) + qtyMatch[0].length)
    const priceMatch = afterQty.match(/([\d,]+\.\d{2})/)
    if (priceMatch) msrp = Math.round(parseFloat(priceMatch[1].replace(/,/g, '')))

    // 進貨總金額：NT$ X,XXX
    const totalMatch = block.match(/NT\$\s*([\d,]+)/)
    const total = totalMatch ? parseInt(totalMatch[1].replace(/,/g, '')) : 0

    // 進貨單價 = 總金額 ÷ 數量
    const unitCost = qty > 0 && total > 0 ? Math.round(total / qty) : 0

    items.push({ name, qty, msrp, unitCost, total, isOpenBox: false })
  }

  return items
}
