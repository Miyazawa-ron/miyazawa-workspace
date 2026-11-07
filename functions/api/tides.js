// 汐见 (/tides/) 的数据接口：GET /api/tides?station=CS&start=2026-11-08&days=7
// 读取日本气象厅潮位表「テキストデータ版」（每站每年一个定宽文本文件），
// 格式说明：https://www.data.jma.go.jp/kaiyou/db/tide/suisan/readme.html
// 每行一天：0-71 为 0～23 时逐时潮位(每个 3 位)，72-77 为年月日，78-79 为站点代码，
// 80-107 为 4 组满潮(时刻 4 位 + 潮位 3 位)，108-135 为 4 组干潮；9999/999 表示无。

const TXT_URL = (year, station) =>
  `https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/${year}/${station}.txt`
const SOURCE_URL = 'https://www.data.jma.go.jp/kaiyou/db/tide/suisan/suisan.php'
const MIN_DATE = '2011-01-01'
const MAX_DATE = '2027-12-31'

const json = (body, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  })

function addDays(date, amount) {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + amount)
  return next.toISOString().slice(0, 10)
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const pad = (n) => String(n).padStart(2, '0')

function parseEvents(line, offset, type, date) {
  const events = []
  for (let i = 0; i < 4; i += 1) {
    const at = offset + i * 7
    const hour = line.slice(at, at + 2).trim()
    const minute = line.slice(at + 2, at + 4).trim()
    const height = Number(line.slice(at + 4, at + 7))
    if (hour === '99' || hour === '' || !Number.isFinite(height)) continue
    events.push({ time: `${date}T${pad(hour)}:${pad(minute)}:00+09:00`, height, type })
  }
  return events
}

function parseLine(line) {
  if (line.length < 136) return null
  const yy = Number(line.slice(72, 74))
  const mm = Number(line.slice(74, 76))
  const dd = Number(line.slice(76, 78))
  if (!yy || !mm || !dd) return null
  const date = `20${pad(yy)}-${pad(mm)}-${pad(dd)}`
  const points = []
  for (let hour = 0; hour < 24; hour += 1) {
    const height = Number(line.slice(hour * 3, hour * 3 + 3))
    if (Number.isFinite(height)) points.push({ time: `${date}T${pad(hour)}:00:00+09:00`, height })
  }
  const events = [...parseEvents(line, 80, 'high', date), ...parseEvents(line, 108, 'low', date)]
    .sort((a, b) => a.time.localeCompare(b.time))
  return { date, points, events }
}

async function loadYear(year, station) {
  // 年度预测表一年只发布一次，让 Cloudflare 边缘缓存 1 天即可。
  const response = await fetch(TXT_URL(year, station), {
    cf: { cacheTtl: 86400, cacheEverything: true },
    signal: AbortSignal.timeout(15000),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`JMA ${response.status}`)
  const days = new Map()
  for (const line of (await response.text()).split('\n')) {
    const day = parseLine(line)
    if (day) days.set(day.date, day)
  }
  return days
}

export async function onRequestGet({ request }) {
  const params = new URL(request.url).searchParams
  const station = params.get('station') || ''
  const start = params.get('start') || ''
  const daysCount = Number(params.get('days') || '7')

  if (!/^[A-Z0-9]{2}$/.test(station)) return json({ error: '不支持的潮汐站点' }, 400)
  if (!Number.isInteger(daysCount) || daysCount < 1 || daysCount > 7) {
    return json({ error: '查询天数须为 1—7 天' }, 400)
  }
  const end = validDate(start) ? addDays(start, daysCount - 1) : ''
  if (!end || start < MIN_DATE || end > MAX_DATE) {
    return json({ error: '日期无效或超出气象厅公开数据范围（2011—2027 年）' }, 400)
  }

  let merged
  try {
    const years = [...new Set([start.slice(0, 4), end.slice(0, 4)])]
    const tables = await Promise.all(years.map((year) => loadYear(year, station)))
    if (tables.some((table) => table === null)) return json({ error: '气象厅没有该站点该年份的潮位表' }, 404)
    merged = new Map(tables.flatMap((table) => [...table]))
  } catch {
    return json({ error: '暂时无法连接日本气象厅，请稍后重试' }, 502)
  }

  const days = Array.from({ length: daysCount }, (_, index) => {
    const date = addDays(start, index)
    return merged.get(date) || { date, points: [], events: [] }
  })
  const [ys, ms, ds] = start.split('-')
  const [ye, me, de] = end.split('-')
  const sourceUrl = `${SOURCE_URL}?${new URLSearchParams({ stn: station, ys, ms, ds, ye, me, de, S_HILO: 'on', S_HOUR: 'on' })}`

  return json({ start, days, sourceUrl }, 200, 'public, max-age=3600')
}
