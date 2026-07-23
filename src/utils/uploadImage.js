const MAX_BYTES = 3 * 1024 * 1024

function blobToData(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

function canvasToBlob(canvas, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
}

async function compressImage(file) {
  if (file.size <= MAX_BYTES) return { blob: file, fileName: file.name, contentType: file.type }

  const img = await loadImage(file)
  const maxSide = 1600
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(img.src)

  let blob = null
  for (const quality of [0.82, 0.72, 0.62, 0.52]) {
    blob = await canvasToBlob(canvas, quality)
    if (blob && blob.size <= MAX_BYTES) break
  }

  return {
    blob,
    fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg',
    contentType: 'image/jpeg',
  }
}

export async function uploadImage(file, folder, baseName) {
  const compressed = await compressImage(file)
  if (!compressed.blob || compressed.blob.size > MAX_BYTES) {
    throw new Error('圖片太大，請換一張較小的圖片')
  }

  const data = await blobToData(compressed.blob)
  const res = await fetch('/api/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folder,
      fileName: baseName ? `${baseName}_${compressed.fileName}` : compressed.fileName,
      contentType: compressed.contentType,
      data,
    }),
  })

  const result = await res.json()
  if (!res.ok) throw new Error(result.error || '圖片上傳失敗')
  return result.url
}
