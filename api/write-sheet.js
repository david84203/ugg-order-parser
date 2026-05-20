import { google } from 'googleapis'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const games = req.body
  if (!Array.isArray(games) || !games.length) {
    return res.status(400).json({ error: 'no games' })
  }

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    const spreadsheetId = process.env.GOOGLE_SHEET_ID

    // 找出 gid=540615026 對應的 sheet 名稱
    const meta = await sheets.spreadsheets.get({ spreadsheetId })
    const sheet = meta.data.sheets.find(s => s.properties.sheetId === 540615026)
    const sheetTitle = sheet?.properties?.title ?? meta.data.sheets[0].properties.title

    // 建立每列資料：A-Y 共 25 欄，A=品名、N=定價
    const rows = games.map(({ name, msrp }) => {
      const row = Array(25).fill('')
      row[0] = name        // A: 中文名稱
      row[13] = msrp || '' // N: 定價
      return row
    })

    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetTitle}!A:Y`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    })

    const updatedRange = appendRes.data.updates?.updatedRange ?? '不明'
    console.log(`write-sheet: 寫入 ${games.length} 筆到 ${sheetTitle} | 範圍: ${updatedRange}`)
    res.status(200).json({ ok: true, added: games.length, range: updatedRange })
  } catch (err) {
    console.error('write-sheet error', err)
    res.status(500).json({ error: err.message })
  }
}
