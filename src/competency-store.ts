import type { DatabaseSync } from 'node:sqlite'
import { transaction } from './database.ts'
import { levels } from './competencies.ts'
import type { Assessment, Entry, Mapping } from './competencies.ts'
import { ReviewError } from './reviews.ts'

function requiredText(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new ReviewError(422, label + ' obbligatorio.')
  return value.trim()
}

export function competencyStore(db: DatabaseSync) {
  const people = db.prepare('SELECT utente, nominativo FROM people ORDER BY nominativo COLLATE NOCASE, utente')
  const entries = db.prepare('SELECT id, kind, name, description, category FROM competency_entries ORDER BY nameKey')
  const entry = db.prepare('SELECT id, kind, name, description, category FROM competency_entries WHERE id = ?')
  const duplicate = db.prepare('SELECT id FROM competency_entries WHERE kind = ? AND nameKey = ? AND id <> ?')
  const insert = db.prepare('INSERT INTO competency_entries (kind, name, nameKey, description, category) VALUES (?, ?, ?, ?, ?)')
  const update = db.prepare('UPDATE competency_entries SET name = ?, nameKey = ?, description = ?, category = ? WHERE id = ?')
  const assessments = db.prepare('SELECT entryId, utente, level, note FROM competency_assessments')
  const hasPerson = db.prepare('SELECT 1 FROM people WHERE utente = ?')
  const assess = db.prepare(`
    INSERT INTO competency_assessments (entryId, utente, level, note) VALUES (?, ?, ?, ?)
    ON CONFLICT(entryId, utente) DO UPDATE SET level = excluded.level, note = excluded.note
    RETURNING entryId, utente, level, note
  `)

  function get(id: number) {
    const row = entry.get(id)
    if (!row) throw new ReviewError(404, 'Voce di catalogo non trovata.')
    return row as Entry
  }

  return {
    read(): Mapping {
      return { people: people.all() as Mapping['people'], entries: entries.all() as Entry[], assessments: assessments.all() as Assessment[] }
    },
    save(input: Record<string, unknown>, id?: number) {
      const current = id === undefined ? undefined : get(id)
      const kind = input.kind ?? current?.kind
      if ((kind !== 'application' && kind !== 'skill') || (current && current.kind !== kind)) {
        throw new ReviewError(422, 'Seleziona un catalogo valido.')
      }
      const name = requiredText(input.name, 'Nome')
      const nameKey = name.normalize('NFC').toLocaleLowerCase('it')
      const description = kind === 'application' ? requiredText(input.description, 'Campo descrizione') : null
      const category = input.category === 'hard' || input.category === 'soft' ? input.category : null
      if (kind === 'skill' && category === null) {
        throw new ReviewError(422, 'Seleziona Hard skill o Soft skill.')
      }
      const storedCategory = kind === 'skill' ? category : null
      return transaction(db, () => {
        if (duplicate.get(kind, nameKey, id ?? 0)) throw new ReviewError(409, 'Esiste già una voce con questo nome nel catalogo.')
        if (id !== undefined) {
          update.run(name, nameKey, description, storedCategory, id)
          return get(id)
        }
        return get(Number(insert.run(kind, name, nameKey, description, storedCategory).lastInsertRowid))
      })
    },
    assess(id: number, input: Record<string, unknown>) {
      get(id)
      const utente = requiredText(input.utente, 'Utente')
      if (!hasPerson.get(utente)) throw new ReviewError(404, 'Persona non trovata in anagrafica.')
      const level = levels.find(value => value === input.level)
      if (!level) throw new ReviewError(422, 'Seleziona un livello valido.')
      if (input.note != null && typeof input.note !== 'string') throw new ReviewError(422, 'Nota non valida.')
      const note = typeof input.note === 'string' ? input.note.trim() || null : null
      return assess.get(id, utente, level, note) as Assessment
    },
  }
}
