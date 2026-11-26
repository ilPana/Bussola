import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { emptyPerson, fields, performances, required } from './people.ts'
import type { Field, Person } from './people.ts'
import { ReviewError, reviewStore } from './reviews.ts'
import { actionStore } from './action-store.ts'
import { competencyStore } from './competency-store.ts'
import { kpiStore } from './kpi-store.ts'
import { decimalAmount, parseCents } from './money.ts'

const port = Number(process.env.BUSSOLA_PORT ?? 4173)
const origin = `http://127.0.0.1:${port}`
const databasePath = process.env.BUSSOLA_DB_PATH ?? join(
  process.env.LOCALAPPDATA ?? homedir(), 'Bussola', 'bussola.sqlite',
)
const assets = resolve(import.meta.dirname, '../dist')
const migrations = resolve(import.meta.dirname, '../migrations')
mkdirSync(dirname(databasePath), { recursive: true })
const db = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true })

const migrationFiles = ['001-people.sql', '002-reviews.sql', '003-actions.sql', '004-competencies.sql', '005-kpi.sql',
  '006-kpi-qualitative-comment.sql']
for (const [index, file] of migrationFiles.entries()) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const version = Number(db.prepare('PRAGMA user_version').get()?.user_version)
    if (version < index + 1) {
      db.exec(readFileSync(join(migrations, file), 'utf8'))
      db.exec(`PRAGMA user_version = ${index + 1}`)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
const reviews = reviewStore(db)
const actions = actionStore(db)
const competencies = competencyStore(db)
const kpi = kpiStore(db)

const columns = fields.map(([key]) => key)
const listPeople = db.prepare('SELECT * FROM people ORDER BY nominativo COLLATE NOCASE, utente')
const findPerson = db.prepare('SELECT * FROM people WHERE utente = ?')
const insertPerson = db.prepare(`INSERT INTO people (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT(utente) DO NOTHING`)
const editable = columns.filter(key => key !== 'utente')
const updatePerson = db.prepare(`UPDATE people SET ${editable.map(key => `${key} = ?`).join(', ')} WHERE utente = ?`)

class RequestError extends Error {
  status: number
  fields?: Partial<Record<Field, string>>

  constructor(status: number, message: string, fields?: Partial<Record<Field, string>>) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

function toPerson(row: Record<string, unknown>): Person {
  const person = { ...emptyPerson }
  for (const [key, , type] of fields) {
    const value = row[key]
    if (value == null) continue
    person[key] = type === 'money' ? decimalAmount(Number(value)) : String(value)
  }
  return person
}

function validate(input: Record<string, unknown>) {
  const values = new Map<Field, string | number | null>()
  const errors: Partial<Record<Field, string>> = {}
  for (const [key, , type] of fields) {
    const raw = input[key] ?? ''
    if (typeof raw !== 'string') {
      errors[key] = 'Valore non valido.'
      continue
    }
    const value = raw.trim()
    if (!value) {
      if (required.has(key)) errors[key] = 'Campo obbligatorio.'
      values.set(key, null)
      continue
    }
    if (key === 'utente' && (value === '.' || value === '..')) errors[key] = 'Inserisci un Utente valido.'
    switch (type) {
      case 'date': {
        const date = new Date(value + 'T00:00:00Z')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
          errors[key] = 'Inserisci una data valida.'
        }
        break
      }
      case 'email':
        if (!/^[^\s@]+@[^\s@]+$/.test(value)) errors[key] = 'Inserisci un indirizzo email valido.'
        break
      case 'select':
        if (!performances.includes(value)) errors[key] = 'Seleziona una prestazione valida.'
        break
      case 'money': {
        const cents = parseCents(value)
        if (cents === null) errors[key] = 'Inserisci un importo valido.'
        values.set(key, cents)
        continue
      }
      case 'number': {
        const normalized = value.replace(',', '.')
        const number = Number(normalized)
        if (!/^\d+(\.\d+)?$/.test(normalized) || !Number.isFinite(number)) {
          errors[key] = 'Inserisci un numero valido.'
        }
        values.set(key, number)
        continue
      }
    }
    values.set(key, value)
  }
  if (Object.keys(errors).length) throw new RequestError(422, 'Controlla i campi indicati.', errors)
  return (key: Field) => values.get(key) ?? null
}

async function readJson(request: IncomingMessage) {
  if (request.headers.origin !== origin || request.headers['content-type']?.split(';')[0] !== 'application/json') {
    throw new RequestError(403, 'Origine della richiesta non consentita.')
  }
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 65536) throw new RequestError(413, 'Richiesta troppo grande.')
  }
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    throw new RequestError(400, 'Richiesta non valida.')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new RequestError(400, 'Richiesta non valida.')
  }
  return data as Record<string, unknown>
}

function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(data))
}

function calendarYear(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1900 || value > 9999) {
    throw new ReviewError(422, 'Inserisci un anno valido.')
  }
  return value
}

const server = createServer(async (request, response) => {
  try {
    if (request.headers.host !== new URL(origin).host) throw new RequestError(403, 'Indirizzo non consentito.')
    const path = new URL(request.url ?? '/', origin).pathname
    if (path === '/api/kpi/years') {
      if (request.method === 'GET') return json(response, 200, kpi.list())
      if (request.method === 'POST') return json(response, 201, kpi.create(calendarYear((await readJson(request)).year)))
    }
    const kpiPath = /^\/api\/kpi\/years\/(\d{4})(?:\/people\/([^/]+))?$/.exec(path)
    if (kpiPath) {
      const year = calendarYear(Number(kpiPath[1]))
      const utente = kpiPath[2] && decodeURIComponent(kpiPath[2])
      if (request.method === 'GET') return json(response, 200, utente ? kpi.getPlan(year, utente) : kpi.read(year))
      if (utente && request.method === 'PUT') {
        const { objectives, qualitativeComment } = await readJson(request)
        return json(response, 200, kpi.savePlan(year, utente, objectives, qualitativeComment))
      }
    }
    if (path === '/api/competencies') {
      if (request.method === 'GET') return json(response, 200, competencies.read())
      if (request.method === 'POST') return json(response, 201, competencies.save(await readJson(request)))
    }
    const competencyPath = /^\/api\/competencies\/([1-9]\d*)(\/assessment)?$/.exec(path)
    if (competencyPath) {
      const id = Number(competencyPath[1])
      if (!Number.isSafeInteger(id)) throw new ReviewError(404, 'Voce di catalogo non trovata.')
      if (!competencyPath[2] && request.method === 'PATCH') {
        return json(response, 200, competencies.save(await readJson(request), id))
      }
      if (competencyPath[2] && request.method === 'PUT') {
        return json(response, 200, competencies.assess(id, await readJson(request)))
      }
    }
    const personActionsPath = /^\/api\/reviews\/(\d{4})\/people\/([^/]+)\/actions$/.exec(path)
    if (personActionsPath) {
      const year = calendarYear(Number(personActionsPath[1]))
      const utente = decodeURIComponent(personActionsPath[2])
      if (request.method === 'GET') return json(response, 200, actions.list(year, utente))
      if (request.method === 'POST') return json(response, 201, actions.create(year, utente, await readJson(request)))
    }
    const actionPath = /^\/api\/actions\/([1-9]\d*)(\/status-changes)?$/.exec(path)
    if (actionPath) {
      const id = Number(actionPath[1])
      if (!Number.isSafeInteger(id)) throw new ReviewError(404, 'Azione non trovata.')
      if (!actionPath[2] && request.method === 'PATCH') {
        return json(response, 200, actions.update(id, await readJson(request)))
      }
      if (actionPath[2] && request.method === 'POST') {
        return json(response, 200, actions.changeState(id, await readJson(request)))
      }
    }
    if (path === '/api/reviews') {
      if (request.method === 'GET') return json(response, 200, reviews.list())
      if (request.method === 'POST') {
        const { year, utenti } = await readJson(request)
        if (!Array.isArray(utenti) || utenti.some(utente => typeof utente !== 'string' || !utente.trim())) {
          throw new ReviewError(422, 'Controlla l’elenco delle persone selezionate.')
        }
        return json(response, 201, reviews.open(calendarYear(year), [...new Set<string>(utenti)]))
      }
    }
    const reviewPath = /^\/api\/reviews\/(\d{4})(?:\/(people)(?:\/([^/]+))?)?$/.exec(path)
    if (reviewPath) {
      const year = calendarYear(Number(reviewPath[1]))
      const peoplePath = reviewPath[2]
      const utente = reviewPath[3] && decodeURIComponent(reviewPath[3])
      if (!peoplePath && request.method === 'GET') return json(response, 200, reviews.read(year))
      if (peoplePath && !utente && request.method === 'POST') {
        const body = await readJson(request)
        if (typeof body.utente !== 'string' || !body.utente.trim()) throw new ReviewError(422, 'Seleziona una persona.')
        return json(response, 201, reviews.add(year, body.utente))
      }
      if (utente && request.method === 'GET') return json(response, 200, reviews.person(year, utente))
      if (utente && request.method === 'PATCH') {
        const body = await readJson(request)
        if (body.left !== true) throw new ReviewError(422, 'Indica l’uscita dal team.')
        return json(response, 200, reviews.markLeft(year, utente))
      }
    }
    if (path === '/api/people') {
      if (request.method === 'GET') return json(response, 200, listPeople.all().map(toPerson))
      if (request.method === 'POST') {
        const value = validate(await readJson(request))
        if (!insertPerson.run(...columns.map(value)).changes) {
          throw new RequestError(409, 'Esiste già una scheda con questo Utente.', { utente: 'Utente già in uso.' })
        }
        return json(response, 201, toPerson(findPerson.get(value('utente'))!))
      }
    }
    const match = /^\/api\/people\/([^/]+)$/.exec(path)
    if (match) {
      const utente = decodeURIComponent(match[1])
      if (request.method === 'GET') {
        const row = findPerson.get(utente)
        if (!row) throw new RequestError(404, 'Scheda non trovata.')
        return json(response, 200, toPerson(row))
      }
      if (request.method === 'PATCH') {
        const input = await readJson(request)
        const row = findPerson.get(utente)
        if (!row) throw new RequestError(404, 'Scheda non trovata.')
        if (Object.hasOwn(input, 'utente') && input.utente !== utente) {
          throw new RequestError(422, 'Utente rimane fisso dopo la creazione.', { utente: 'Utente non modificabile.' })
        }
        const value = validate({ ...toPerson(row), ...input, utente })
        updatePerson.run(...editable.map(value), utente)
        return json(response, 200, toPerson(findPerson.get(utente)!))
      }
    }
    if (request.method === 'GET' && (path === '/' || path.startsWith('/assets/'))) {
      const file = path === '/' ? join(assets, 'index.html') : resolve(assets, '.' + decodeURIComponent(path))
      if (!file.startsWith(assets + sep)) throw new RequestError(404, 'Risorsa non trovata.')
      const mime = file.endsWith('.html') ? 'text/html; charset=utf-8'
        : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8'
      let contents
      try {
        contents = readFileSync(file)
      } catch {
        throw new RequestError(404, 'Risorsa non trovata. Esegui npm run build prima di avviare Bussola.')
      }
      response.writeHead(200, { 'Content-Type': mime, 'X-Content-Type-Options': 'nosniff' })
      response.end(contents)
      return
    }
    throw new RequestError(404, 'Risorsa non trovata.')
  } catch (error) {
    if (error instanceof RequestError) return json(response, error.status, { message: error.message, fields: error.fields })
    if (error instanceof ReviewError) return json(response, error.status, { message: error.message })
    if (error instanceof URIError) return json(response, 400, { message: 'Indirizzo non valido.' })
    console.error('Errore durante l’elaborazione della richiesta.')
    json(response, 500, { message: 'Operazione non riuscita.' })
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Bussola disponibile su ${origin}`)
  if (process.argv.includes('--open') && process.platform === 'win32') {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', origin], error => {
      if (error) console.error(`Apri Bussola nel browser all’indirizzo ${origin}`)
    })
  }
})
