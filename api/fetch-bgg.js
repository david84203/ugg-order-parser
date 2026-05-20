export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { url } = req.body || {}
  if (!url || !url.includes('boardgamegeek.com')) {
    return res.status(400).json({ error: '請輸入正確的 BGG 連結' })
  }

  const apiKey = process.env.FIRECRAWL_API_KEY
  console.log('fetch-bgg: apiKey present:', !!apiKey, 'url:', url?.slice(0, 50))
  if (!apiKey) return res.status(500).json({ error: '伺服器設定錯誤，請聯絡管理員' })

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['extract'],
        extract: {
          prompt: 'Extract board game information from this BGG page.',
          schema: {
            type: 'object',
            properties: {
              englishName: { type: 'string', description: 'English name of the board game' },
              minPlayers: { type: 'integer', description: 'Minimum player count' },
              maxPlayers: { type: 'integer', description: 'Maximum player count' },
              bggRating: { type: 'number', description: 'BGG average user rating' },
              bestPlayers: { type: 'string', description: 'Best player count per community poll, e.g. "3-4" or "4"' },
              playTime: { type: 'integer', description: 'Play time in minutes (max value if range)' },
              complexity: { type: 'number', description: 'Game complexity/weight rating out of 5' },
            },
            required: ['englishName'],
          },
        },
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('Firecrawl error:', text)
      return res.status(502).json({ error: '查詢 BGG 失敗，請稍後再試' })
    }

    const data = await response.json()
    const ext = data.data?.extract || {}

    const players =
      ext.minPlayers && ext.maxPlayers
        ? ext.minPlayers === ext.maxPlayers
          ? `${ext.minPlayers}`
          : `${ext.minPlayers}-${ext.maxPlayers}`
        : ext.minPlayers
          ? `${ext.minPlayers}+`
          : ''

    return res.status(200).json({
      englishName: ext.englishName || '',
      players,
      bggRating: ext.bggRating ?? null,
      bestPlayers: ext.bestPlayers || '',
      playTime: ext.playTime ?? null,
      complexity: ext.complexity ?? null,
    })
  } catch (e) {
    const msg = `${e?.name}: ${e?.message}`
    console.error('fetch-bgg error:', msg)
    return res.status(500).json({ error: msg })
  }
}
