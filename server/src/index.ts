import { createApp } from './app.ts'
import { openDatabase } from './db.ts'
import { seed } from './seed.ts'
import { resolveMode } from './arbiter.ts'

// Deliberately NOT `PORT`: dev harnesses and hosts set that for the web app,
// and inheriting it made the API try to bind Vite's port. API_PORT is ours.
const PORT = Number(process.env.API_PORT ?? 5179)
const db = openDatabase()

// First run on an empty database? Populate it so the product is never empty.
const { n } = db.prepare('SELECT COUNT(*) AS n FROM allocations').get() as { n: number }
if (n === 0) {
  console.log('[boot] empty database detected — seeding demonstration tenant')
  seed(db)
}

createApp(db).listen(PORT, () => {
  console.log(`[boot] QUOTIENT API listening on http://localhost:${PORT}`)
  console.log(`[boot] ARBITER mode: ${resolveMode()}`)
})
