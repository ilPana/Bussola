import type { DatabaseSync } from 'node:sqlite'
import { transaction } from './database.ts'
import { fixedObjectives, fullWeight, initiativeLimit, maxScore, minScore, newObjectives, summarize } from './kpi.ts'
import type { KpiYear, Objective, Plan } from './kpi.ts'
import { ReviewError } from './reviews.ts'

function optionalUnits(value: unknown, min: number, max: number, message: string): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ReviewError(422, message)
  }
  return value
}

export function kpiStore(db: DatabaseSync) {
  const years = db.prepare('SELECT year FROM kpi_years ORDER BY year DESC')
  const hasYear = db.prepare('SELECT 1 FROM kpi_years WHERE year = ?')
  const createYear = db.prepare('INSERT INTO kpi_years (year) VALUES (?) ON CONFLICT(year) DO NOTHING')
  const hasPerson = db.prepare('SELECT 1 FROM people WHERE utente = ?')
  const people = db.prepare(`
    SELECT p.utente, p.nominativo, k.objectives FROM people p
    LEFT JOIN kpi_plans k ON k.utente = p.utente AND k.year = ?
    ORDER BY p.nominativo COLLATE NOCASE, p.utente
  `)
  const findPlan = db.prepare('SELECT objectives, qualitativeComment FROM kpi_plans WHERE year = ? AND utente = ?')
  const savePlan = db.prepare(`
    INSERT INTO kpi_plans (year, utente, objectives, qualitativeComment) VALUES (?, ?, ?, ?)
    ON CONFLICT(year, utente) DO UPDATE SET objectives = excluded.objectives,
      qualitativeComment = excluded.qualitativeComment
  `)

  function checkYear(year: number) {
    if (!hasYear.get(year)) throw new ReviewError(404, 'Anno KPI non trovato.')
  }

  function checkPerson(utente: string) {
    if (!hasPerson.get(utente)) throw new ReviewError(404, 'Persona non trovata in anagrafica.')
  }

  function read(year: number): KpiYear {
    checkYear(year)
    const rows = people.all(year) as { utente: string; nominativo: string; objectives: string | null }[]
    return { year, people: rows.map(({ utente, nominativo, objectives }) => ({
      utente, nominativo, summary: objectives === null ? null : summarize(JSON.parse(objectives)),
    })) }
  }

  function readPlan(year: number, utente: string): Plan {
    const stored = findPlan.get(year, utente) as { objectives: string; qualitativeComment: string | null } | undefined
    return {
      utente,
      objectives: stored ? JSON.parse(stored.objectives) : newObjectives(),
      qualitativeComment: stored?.qualitativeComment ?? null,
    }
  }

  return {
    list: () => (years.all() as { year: number }[]).map(row => row.year),
    read,
    create(year: number) {
      return transaction(db, () => {
        if (!createYear.run(year).changes) throw new ReviewError(409, 'L’anno KPI esiste già.')
        return read(year)
      })
    },
    getPlan(year: number, utente: string): Plan {
      checkYear(year)
      checkPerson(utente)
      return readPlan(year, utente)
    },
    savePlan(year: number, utente: string, input: unknown, comment: unknown): Plan {
      if (!Array.isArray(input) || input.length < fixedObjectives.length || input.length > fixedObjectives.length + initiativeLimit) {
        throw new ReviewError(422, 'Il piano deve contenere sette obiettivi fissi e fino a cinque iniziative.')
      }
      if (comment != null && typeof comment !== 'string') {
        throw new ReviewError(422, 'Inserisci un testo per la valutazione qualitativa.')
      }
      return transaction(db, () => {
        checkYear(year)
        checkPerson(utente)
        const existing = readPlan(year, utente)
        const objectives = input.map((item, index): Objective => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ReviewError(422, 'Obiettivo non valido.')
          const ordinal = index + 1
          const fixed = index < fixedObjectives.length
          const name = fixed ? existing.objectives[index].name : typeof item.name === 'string' ? item.name.trim() : ''
          if (!name) throw new ReviewError(422, `Inserisci la descrizione dell’iniziativa ${ordinal - fixedObjectives.length}.`)
          return {
            name,
            weight: optionalUnits(item.weight, 0, fullWeight, `Obiettivo ${ordinal}: usa un peso tra 0 e 100%.`),
            score: optionalUnits(item.score, minScore, maxScore, `Obiettivo ${ordinal}: usa un punteggio da 65 a 135.`),
          }
        })
        const qualitativeComment = comment === undefined ? existing.qualitativeComment : comment?.trim() || null
        savePlan.run(year, utente, JSON.stringify(objectives), qualitativeComment)
        return { utente, objectives, qualitativeComment }
      })
    },
  }
}
