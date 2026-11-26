import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, request } from './api.ts'
import { ActionPanel } from './action-panel.tsx'
import { displayDate } from './calendar.ts'
import { displayAmount } from './money.ts'
import type { Person } from './people.ts'
import type { ActionReference } from './review-actions.ts'
import { snapshotFields } from './reviews.ts'
import type { Review, ReviewPerson, ReviewSummary } from './reviews.ts'

const nextYear = new Date().getFullYear() + 1

function displayField(person: ReviewPerson, key: typeof snapshotFields[number][0]) {
  if (key === 'ral' || key === 'ptp') {
    return displayAmount(person[key])
  }
  if (key === 'dataLivello' || key === 'dataPtp') {
    const date = person[key]
    return date ? displayDate(date) : '—'
  }
  return person[key] ?? '—'
}

export function PeopleReview() {
  const [summaries, setSummaries] = useState<ReviewSummary[]>([])
  const [directory, setDirectory] = useState<Person[]>([])
  const [review, setReview] = useState<Review | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [focusedAction, setFocusedAction] = useState<number | null>(null)
  const [opening, setOpening] = useState(false)
  const [year, setYear] = useState(String(nextYear))
  const [participants, setParticipants] = useState<string[]>([])
  const [entrant, setEntrant] = useState('')
  const [busy, setBusy] = useState(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const detail = useRef<HTMLElement>(null)

  async function run(work: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (issue) {
      setError(issue instanceof ApiError ? issue.message : 'Operazione non riuscita. Riprova.')
    } finally {
      setBusy(false)
    }
  }

  function load() {
    void run(async () => {
      const [years, people] = await Promise.all([
        request<ReviewSummary[]>('/api/reviews'), request<Person[]>('/api/people'),
      ])
      setSummaries(years)
      setDirectory(people)
      setReview(years.length ? await request<Review>('/api/reviews/' + years[0].year) : null)
      setReady(true)
    })
  }

  useEffect(load, [])
  useEffect(() => { detail.current?.focus() }, [selected])

  function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run(async () => {
      const opened = await request<Review>('/api/reviews', 'POST', { year: Number(year), utenti: participants })
      setSummaries(current => [{ year: opened.year, openedOn: opened.openedOn }, ...current]
        .sort((a, b) => b.year - a.year))
      setReview(opened)
      setSelected(null)
      setFocusedAction(null)
      setEntrant('')
      setOpening(false)
    })
  }

  const person = review?.people.find(row => row.utente === selected)
  const available = directory.filter(candidate => !review?.people.some(row => row.utente === candidate.utente))

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!review || !entrant) return
    void run(async () => {
      const added = await request<ReviewPerson>(`/api/reviews/${review.year}/people`, 'POST', { utente: entrant })
      setReview({ ...review, people: [...review.people, added].sort((a, b) => a.nominativo.localeCompare(b.nominativo, 'it')) })
      setSelected(added.utente)
      setFocusedAction(null)
      setEntrant('')
    })
  }

  function markLeft() {
    if (!review || !person || !window.confirm(`Registrare l’uscita di ${person.nominativo} dal team?`)) return
    void run(async () => {
      const updated = await request<ReviewPerson>(
        `/api/reviews/${review.year}/people/${encodeURIComponent(person.utente)}`, 'PATCH', { left: true },
      )
      setReview({ ...review, people: review.people.map(row => row.utente === updated.utente ? updated : row) })
    })
  }

  function navigateAction(action: ActionReference) {
    void run(async () => {
      setReview(await request<Review>('/api/reviews/' + action.year))
      setFocusedAction(action.id)
      setEntrant('')
    })
  }

  return <main className="frame">
    <div className="heading">
      <h1>People Review</h1>
      {ready && !opening && <button className="primary" disabled={busy} onClick={() => {
        setParticipants(directory.map(row => row.utente))
        setYear(String(nextYear))
        setOpening(true)
        setError('')
      }}>+ Nuova review</button>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {busy && <p role="status">Attendere…</p>}
    {!ready && !busy && <button onClick={load}>Riprova</button>}
    {opening
      ? <form className="panel review-panel" onSubmit={open}>
        <h2>Apri People Review</h2>
        <fieldset disabled={busy}>
          <legend>Anno e persone da includere</legend>
          <label htmlFor="new-year">Anno di riferimento</label>{' '}
          <input id="new-year" type="number" min="1900" max="9999" step="1" required value={year}
            onChange={event => setYear(event.target.value)} />
          {directory.length === 0 && <p>L’anagrafica è vuota.</p>}
          <ul className="participants">{directory.map(candidate => <li key={candidate.utente}>
            <label><input type="checkbox" checked={participants.includes(candidate.utente)}
              onChange={event => setParticipants(current => event.target.checked
                ? [...current, candidate.utente] : current.filter(value => value !== candidate.utente))} />
              {candidate.nominativo} <small>({candidate.utente})</small></label>
          </li>)}</ul>
        </fieldset>
        <div className="form-actions"><button className="primary" disabled={busy}>Apri review</button>
          <button type="button" disabled={busy} onClick={() => { setOpening(false); setError('') }}>Annulla</button></div>
      </form>
      : review ? <>
        <div className="review-toolbar">
          <label htmlFor="review-year">Anno</label>
          <select id="review-year" value={review.year} disabled={busy} onChange={event => {
            const chosen = event.target.value
            void run(async () => {
              setReview(await request<Review>('/api/reviews/' + chosen))
              setSelected(null)
              setFocusedAction(null)
              setEntrant('')
            })
          }}>{summaries.map(summary => <option key={summary.year}>{summary.year}</option>)}</select>
          <span>Aperta il {displayDate(review.openedOn)}</span>
        </div>
        <div className="panel table-scroll"><table>
          <thead><tr>{[...snapshotFields.map(([, label]) => label), 'Azioni'].map(label =>
            <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{review.people.map(row => <tr key={row.utente}>
            {snapshotFields.map(([key]) => <td key={key}>{displayField(row, key)}
              {key === 'nominativo' && row.leftOn && <small className="left-team">Uscita dal team</small>}</td>)}
            <td><button className="person" disabled={busy} onClick={() => { setFocusedAction(null); setSelected(row.utente) }}
              aria-label={`Apri dettaglio di ${row.nominativo}, azioni: ${row.actionCount}`}>Apri ({row.actionCount})</button></td>
          </tr>)}</tbody>
        </table>{review.people.length === 0 && <p className="message">La review è vuota.</p>}</div>
        {available.length > 0 && <form className="review-toolbar" onSubmit={add}>
          <label htmlFor="entrant">Persona da aggiungere</label>
          <select id="entrant" required disabled={busy} value={entrant} onChange={event => setEntrant(event.target.value)}>
            <option value="">Seleziona</option>
            {available.map(candidate => <option key={candidate.utente} value={candidate.utente}>{candidate.nominativo} ({candidate.utente})</option>)}
          </select>
          <button disabled={busy || !entrant}>Aggiungi alla review</button>
        </form>}
        {person && <section className="panel review-panel" ref={detail} tabIndex={-1} aria-labelledby="review-person">
          <h2 id="review-person">{person.nominativo}</h2>
          <p>Fotografia del {displayDate(person.includedOn)}</p>
          <dl className="fields">{snapshotFields.map(([key, label]) => <div key={key}>
            <dt>{label}</dt><dd>{displayField(person, key)}</dd>
          </div>)}</dl>
          {person.leftOn
            ? <p>Uscita dal team registrata il {displayDate(person.leftOn)}.</p>
            : <button disabled={busy} onClick={markLeft}>Registra uscita dal team</button>}
          <ActionPanel key={`${review.year}/${person.utente}`} year={review.year} utente={person.utente}
            focusedAction={focusedAction} disabled={busy} onNavigate={navigateAction}
            onCountChange={actionCount => setReview(current => current?.year === review.year
              ? { ...current, people: current.people.map(row => row.utente === person.utente ? { ...row, actionCount } : row) }
              : current)} />
        </section>}
      </> : ready && <p>Nessuna People Review aperta.</p>}
  </main>
}
