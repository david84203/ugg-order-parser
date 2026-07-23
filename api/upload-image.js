/* global Buffer, process */

import { google } from 'googleapis'
import { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET
const MAX_BYTES = 3 * 1024 * 1024
const ALLOWED_FOLDERS = new Set(['inventory', 'rental-games'])

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON')
  return JSON.parse(raw.replace(/^\uFEFF/, ''))
}

function safeFileName(name) {
  return String(name || 'image.jpg')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'image.jpg'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    if (!BUCKET) throw new Error('Missing FIREBASE_STORAGE_BUCKET')

    const { folder, fileName, contentType, data } = req.body || {}
    if (!ALLOWED_FOLDERS.has(folder)) {
      return res.status(400).json({ error: 'Invalid upload folder' })
    }
    if (!contentType?.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image uploads are allowed' })
    }
    if (!data) {
      return res.status(400).json({ error: 'Missing image data' })
    }

    const buffer = Buffer.from(data, 'base64')
    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ error: 'Image is too large. Please use an image under 3MB.' })
    }

    const auth = new google.auth.GoogleAuth({
      credentials: getCredentials(),
      scopes: ['https://www.googleapis.com/auth/devstorage.full_control'],
    })
    const storage = google.storage({ version: 'v1', auth })
    const token = randomUUID()
    const objectName = `${folder}/${Date.now()}_${safeFileName(fileName)}`

    await storage.objects.insert({
      bucket: BUCKET,
      requestBody: {
        name: objectName,
        contentType,
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
      media: {
        mimeType: contentType,
        body: Readable.from(buffer),
      },
    })

    const encodedName = encodeURIComponent(objectName)
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodedName}?alt=media&token=${token}`
    return res.status(200).json({ url, path: objectName })
  } catch (err) {
    console.error('upload-image error:', err)
    return res.status(500).json({ error: err.message })
  }
}
