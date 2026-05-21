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
    const today = new Date().toLocaleDateString('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).replace(/\//g, '-')

    const rows = games.map(g => {
      const row = Array(26).fill('')
      row[0]  = g.name || ''
      row[2]  = g.englishName || ''      // C: 英文名稱
      row[3]  = g.lang || ''             // D: 語言版本
      row[4]  = g.players || ''          // E: 遊戲人數
      row[5]  = g.location || ''         // F: 放置櫃位
      row[6]  = g.bggRating || ''        // G: BGG玩家評分
      row[7]  = g.bestPlayers || ''      // H: BGG建議最佳人數
      row[8]  = g.playTime || ''         // I: BGG遊戲時間(分鐘)
      row[9]  = g.complexity || ''       // J: BGG遊戲難度
      row[10] = g.bggUrl || ''           // K: BGG連結
      row[13] = g.msrp || g.price || '' // N: 定價
      row[14] = g.rental || ''           // O: 租金
      row[15] = g.category || ''         // P: 分類
      row[16] = g.tag1 || ''             // Q: 標籤1
      row[17] = g.tag2 || ''             // R: 標籤2
      row[18] = g.tag3 || ''             // S: 標籤3
      row[19] = g.sticker || ''          // T: 貼紙
      row[20] = g.imageUrl || ''          // U: 圖片（Firebase Storage URL 或空）
      row[21] = g.youtubeLink || ''      // V: 教學
      row[22] = g.source || ''           // W: 出處
      row[23] = g.playerMode || ''       // X: 玩家模式
      row[25] = today                    // Z: 到貨日
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
