import type { DatabaseSync } from 'node:sqlite'
import { localDate } from './calendar.ts'
import { transaction } from './database.ts'
import { parseCents } from './money.ts'
import { actionStates, actionTypes } from './review-actions.ts'
import type { ActionReference, PersonActions, ReviewAction, StatusChange } from './review-actions.ts'
import { ReviewError } from './reviews.ts'

type ActionRow = Omit<ReviewAction, 'source' | 'continuation' | 'history'> & { sourceId: number | null }

function choice<T extends string>(value: unknown, allowed: readonly T[], label: string) {
  const match = allowed.find(item => item === value)
  if (!match) throw new ReviewError(422, 'Seleziona un valore valido per ' + label + '.')
  return match
}

function text(value: unknown, label: string, required = false) {
  if (value != null && typeof value !== 'string') throw new ReviewError(422, label + ': valore non valido.')
  const result = typeof value === 'string' ? value.trim() : ''
  if (!result && required) throw new ReviewError(422, label + ': campo obbligatorio.')
  return result || null
}

function amount(value: unknown, label: string) {
  const input = text(value, label)
  if (input === null) return null
  const cents = parseCents(input)
  if (cents === null) throw new ReviewError(422, label + ': inserisci un importo valido.')
  return cents
}

export function actionStore(db: DatabaseSync) {
  const hasPerson = db.prepare('SELECT 1 FROM review_people WHERE year = ? AND utente = ?')
  const list = db.prepare('SELECT * FROM actions WHERE year = ? AND utente = ? ORDER BY id')
  const find = db.prepare('SELECT * FROM actions WHERE id = ?')
  const reference = db.prepare('SELECT id, year, type, proposal FROM actions WHERE id = ?')
  const continuation = db.prepare('SELECT id, year, type, proposal FROM actions WHERE sourceId = ?')
  const history = db.prepare(`
    SELECT id, previousState, state, changedOn, note FROM action_status_changes WHERE actionId = ? ORDER BY id
  `)
  const sources = db.prepare(`
    SELECT origin.id, origin.year, origin.type, origin.proposal FROM actions origin
    WHERE origin.year = ? AND origin.utente = ? AND origin.state = 'Rinviata'
      AND NOT EXISTS (SELECT 1 FROM actions next WHERE next.sourceId = origin.id)
    ORDER BY origin.id
  `)
  const insert = db.prepare(`
    INSERT INTO actions (
      year, utente, type, proposal, state, plannedPeriod, proposedLevel, proposedRal, proposedPtp,
      initialLevel, initialRal, initialPtp, sourceId
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const updatePromotion = db.prepare('UPDATE actions SET proposedLevel = ?, proposedRal = ?, proposedPtp = ? WHERE id = ?')
  const updateState = db.prepare('UPDATE actions SET state = ? WHERE id = ?')
  const log = db.prepare(`
    INSERT INTO action_status_changes (actionId, previousState, state, changedOn, note) VALUES (?, ?, ?, ?, ?)
  `)

  function get(id: number) {
    const row = find.get(id)
    if (!row) throw new ReviewError(404, 'Azione non trovata.')
    return row as ActionRow
  }

  function detail(row: ActionRow): ReviewAction {
    const { sourceId, ...action } = row
    return {
      ...action,
      source: sourceId === null ? null : reference.get(sourceId) as ActionReference,
      continuation: (continuation.get(row.id) as ActionReference | undefined) ?? null,
      history: history.all(row.id) as StatusChange[],
    }
  }

  function checkPerson(year: number, utente: string) {
    if (!hasPerson.get(year, utente)) throw new ReviewError(404, 'Persona non inclusa nella People Review.')
  }

  return {
    list(year: number, utente: string): PersonActions {
      checkPerson(year, utente)
      return {
        actions: (list.all(year, utente) as ActionRow[]).map(detail),
        sources: sources.all(year - 1, utente) as ActionReference[],
      }
    },
    create(year: number, utente: string, input: Record<string, unknown>) {
      const type = choice(input.type, actionTypes, 'il tipo di azione')
      const state = choice(input.state ?? 'Proposta', actionStates, 'lo stato')
      const proposal = text(input.proposal, 'Proposta iniziale', true)
      const period = text(input.plannedPeriod, 'Periodo previsto')
      const level = type === 'Promozione' ? text(input.proposedLevel, 'Livello proposto', true) : null
      const ral = type === 'Promozione' ? amount(input.proposedRal, 'RAL proposta') : null
      const ptp = type === 'Promozione' ? amount(input.proposedPtp, 'PTP proposto') : null
      const sourceId = input.sourceId ?? null
      if (sourceId !== null && (typeof sourceId !== 'number' || !Number.isSafeInteger(sourceId) || sourceId < 1)) {
        throw new ReviewError(422, 'Seleziona un’azione di origine valida.')
      }

      return transaction(db, () => {
        checkPerson(year, utente)
        if (sourceId !== null) {
          const source = get(sourceId)
          if (source.year !== year - 1 || source.utente !== utente || source.state !== 'Rinviata') {
            throw new ReviewError(422, 'L’origine deve essere un’azione rinviata della stessa persona nella review precedente.')
          }
          if (continuation.get(sourceId)) throw new ReviewError(409, 'L’azione rinviata è già collegata.')
        }
        const result = insert.run(year, utente, type, proposal, state, period, level, ral, ptp, level, ral, ptp, sourceId)
        return detail(get(Number(result.lastInsertRowid)))
      })
    },
    update(id: number, input: Record<string, unknown>) {
      return transaction(db, () => {
        const action = get(id)
        if (action.type !== 'Promozione') throw new ReviewError(422, 'I valori proposti si applicano alle promozioni.')
        const level = Object.hasOwn(input, 'proposedLevel') ? text(input.proposedLevel, 'Livello proposto', true) : action.proposedLevel
        const ral = Object.hasOwn(input, 'proposedRal') ? amount(input.proposedRal, 'RAL proposta') : action.proposedRal
        const ptp = Object.hasOwn(input, 'proposedPtp') ? amount(input.proposedPtp, 'PTP proposto') : action.proposedPtp
        updatePromotion.run(level, ral, ptp, id)
        return detail(get(id))
      })
    },
    changeState(id: number, input: Record<string, unknown>) {
      const state = choice(input.state, actionStates, 'lo stato')
      const note = text(input.note, 'Nota')
      return transaction(db, () => {
        const action = get(id)
        if (action.state === state) return detail(action)
        if (action.state === 'Rinviata' && continuation.get(id)) {
          throw new ReviewError(409, 'L’azione è già stata ripresa nella review successiva.')
        }
        updateState.run(state, id)
        log.run(id, action.state, state, localDate(), note)
        return detail(get(id))
      })
    },
  }
}
