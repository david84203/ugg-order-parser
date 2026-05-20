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

    // 欄位對應（與 ugg-inventory add-rental-game.js 一致）：
    // A(0)=中文名稱, B(1)=英文名稱, D(3)=語言版本, E(4)=遊戲人數
    // F(5)=放置櫃位, K(10)=BGG連結, N(13)=定價, O(14)=租金
    // P(15)=分類, Q(16)=標籤1, R(17)=標籤2, S(18)=標籤3
    // T(19)=貼紙, U(20)=圖片, V(21)=教學
    const rows = games.map(g => {
      const row = Array(26).fill('')
      row[0]  = g.name || ''
      row[1]  = g.englishName || ''
      row[3]  = g.lang || ''
      row[4]  = g.players || ''
      row[5]  = g.location || ''
      row[10] = g.bggUrl || ''
      row[13] = g.msrp || g.price || ''
      row[14] = g.rental || ''
      row[15] = g.category || ''
      row[16] = g.tag1 || ''
      row[17] = g.tag2 || ''
      row[18] = g.tag3 || ''
      row[19] = g.sticker || ''
      row[20] = g.imageUrl || ''
      row[21] = g.youtubeLink || ''
      return row
    })

    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetTitle}!A:Z`,
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
