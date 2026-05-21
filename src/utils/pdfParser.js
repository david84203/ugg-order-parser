/**
 * 從 PDF 檔案抽取文字，保留行結構
 */
export async function extractPdfText(file) {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).href

  const data = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise
  let fullText = ''

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const items = content.items
    if (!items.length) continue

    // 依 y 座標（由高到低）再依 x 座標排序，重建行結構
    const sorted = [...items].sort((a, b) => {
      const dy = b.transform[5] - a.transform[5]
      return Math.abs(dy) > 3 ? dy : a.transform[4] - b.transform[4]
    })

    const lines = []
    let row = []
    let lastY = sorted[0].transform[5]

    for (const item of sorted) {
      if (Math.abs(item.transform[5] - lastY) > 3) {
        lines.push(row.map(i => i.str).join(' ').trim())
        row = [item]
        lastY = item.transform[5]
      } else {
        row.push(item)
      }
    }
    if (row.length) lines.push(row.map(i => i.str).join(' ').trim())

    fullText += lines.filter(Boolean).join('\n') + '\n'
  }

  return fullText
}
