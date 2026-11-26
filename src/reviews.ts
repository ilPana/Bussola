import type { DatabaseSync } from 'node:sqlite'
import { ageOn, localDate } from './calendar.ts'
import { transaction } from './database.ts'

export const snapshotFields = [
  ['utente', 'Utente'], ['nominativo', 'Nominativo'], ['age', 'Età'],
  ['codiceRuolo', 'Codice ruolo'], ['ral', 'RAL'], ['livello', 'Livello'],
  ['dataLivello', 'Data livello'], ['ptp', 'PTP'], ['dataPtp', 'Data PTP'],
] as const

export type ReviewSummary = { year: number; openedOn: string }
export type ReviewPerson = {
  utente: string
  nominativo: string
  includedOn: string
  leftOn: string | null
  age: number | null
  codiceRuolo: string | null
  ral: number | null
  livello: string | null
  dataLivello: string | null
  ptp: number | null
  dataPtp: string | null
  actionCount: number
}
export type Review = ReviewSummary & { people: ReviewPerson[] }

export class ReviewError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function reviewStore(db: DatabaseSync) {
  const list = db.prepare('SELECT year, openedOn FROM reviews ORDER BY year DESC')
  const find = db.prepare('SELECT year, openedOn FROM reviews WHERE year = ?')
  const create = db.prepare('INSERT INTO reviews (year, openedOn) VALUES (?, ?) ON CONFLICT(year) DO NOTHING')
  const peopleWithCounts = `
    SELECT person.*, (
      SELECT COUNT(*) FROM actions WHERE year = person.year AND utente = person.utente
    ) AS actionCount FROM review_people person
  `
  const findPeople = db.prepare(peopleWithCounts + ' WHERE year = ? ORDER BY nominativo COLLATE NOCASE, utente')
  const findPerson = db.prepare(peopleWithCounts + ' WHERE year = ? AND utente = ?')
  const source = db.prepare('SELECT dataNascita FROM people WHERE utente = ?')
  const copy = db.prepare(`
    INSERT INTO review_people (
      year, includedOn, age, utente, nominativo, codiceRuolo, ral, livello, dataLivello, ptp, dataPtp
    )
    SELECT ?, ?, ?, utente, nominativo, codiceRuolo, ral, livello, dataLivello, ptp, dataPtp
    FROM people WHERE utente = ? ON CONFLICT(year, utente) DO NOTHING
  `)
  const leave = db.prepare('UPDATE review_people SET leftOn = COALESCE(leftOn, ?) WHERE year = ? AND utente = ?')

  function summary(year: number) {
    const row = find.get(year)
    if (!row) throw new ReviewError(404, 'People Review non trovata.')
    return row as ReviewSummary
  }

  function person(year: number, utente: string) {
    const row = findPerson.get(year, utente)
    if (!row) throw new ReviewError(404, 'Persona non inclusa nella People Review.')
    return row as ReviewPerson
  }

  function read(year: number): Review {
    return { ...summary(year), people: findPeople.all(year) as ReviewPerson[] }
  }

  function include(year: number, utente: string, date: string) {
    const row = source.get(utente)
    if (!row) throw new ReviewError(404, 'Una delle persone selezionate non è in anagrafica.')
    const age = typeof row.dataNascita === 'string' ? ageOn(row.dataNascita, date) : null
    if (!copy.run(year, date, age, utente).changes) {
      throw new ReviewError(409, 'La persona è già inclusa nella People Review.')
    }
  }

  return {
    list: () => list.all() as ReviewSummary[],
    read,
    person,
    open(year: number, utenti: string[]) {
      return transaction(db, () => {
        const date = localDate()
        if (!create.run(year, date).changes) {
          throw new ReviewError(409, 'La People Review per questo anno è già aperta.')
        }
        for (const utente of utenti) include(year, utente, date)
        return read(year)
      })
    },
    add(year: number, utente: string) {
      return transaction(db, () => {
        summary(year)
        include(year, utente, localDate())
        return person(year, utente)
      })
    },
    markLeft(year: number, utente: string) {
      if (!leave.run(localDate(), year, utente).changes) {
        throw new ReviewError(404, 'Persona non inclusa nella People Review.')
      }
      return person(year, utente)
    },
  }
}
