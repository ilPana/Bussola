import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, request } from './api.ts'
import { fixedObjectives, fullWeight, initiativeLimit, maxScore, minScore, summarize } from './kpi.ts'
import type { KpiYear, Objective, Plan, Summary } from './kpi.ts'
import { decimalAmount, parseCents } from './money.ts'

const endpoint = '/api/kpi/years'
const resultFormat = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const weightFormat = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 })
type DraftObjective = { name: string; weight: string; score: string }

function draftFrom(objective: Objective): DraftObjective {
  const display = (value: number | null) => value === null ? '' : decimalAmount(value).replace('.', ',')
  return { name: objective.name, weight: display(objective.weight), score: display(objective.score) }
}

function inspect(items: DraftObjective[]) {
  const checks = items.map((item, index) => {
    const weight = parseCents(item.weight.trim())
    const score = parseCents(item.score.trim())
    return {
      name: index >= fixedObjectives.length && !item.name.trim(),
      weight: Boolean(item.weight.trim()) && (weight === null || weight > fullWeight),
      score: Boolean(item.score.trim()) && (score === null || score < minScore || score > maxScore),
      value: { name: item.name, weight: weight !== null && weight <= fullWeight ? weight : null,
        score: score !== null && score >= minScore && score <= maxScore ? score : null },
    }
  })
  const objectives = checks.map(row => row.value)
  return { checks, objectives, invalid: checks.some(row => row.name || row.weight || row.score), summary: summarize(objectives) }
}

function outcome(score: number | null) {
  if (score === null) return '—'
  if (score === 10000) return 'Raggiunto'
  return score > 10000 ? 'Overperforming' : 'Underperforming'
}

function status(summary: Summary) {
  if (summary.result !== null) return 'Valutazione completa'
  if (summary.weightTotal === fullWeight && summary.weightedCount === summary.count) return 'In attesa di valutazione'
  return 'Bozza'
}

export function KpiPanel() {
  const [years, setYears] = useState<number[]>([])
  const [annual, setAnnual] = useState<KpiYear | null>(null)
  const [newYear, setNewYear] = useState<string | null>(null)
  const [selected, setSelected] = useState<KpiYear['people'][number] | null>(null)
  const [draft, setDraft] = useState<DraftObjective[]>([])
  const [qualitativeComment, setQualitativeComment] = useState('')
  const [dirty, setDirty] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const detail = useRef<HTMLElement>(null)

  async function run(work: () => Promise<void>) {
    setBusy(true)
    setError('')
    setNotice('')
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
      const available = await request<number[]>(endpoint)
      setYears(available)
      if (available.length) setAnnual(await request<KpiYear>(endpoint + '/' + available[0]))
      setReady(true)
    })
  }

  useEffect(load, [])
  useEffect(() => { detail.current?.focus() }, [selected])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function allowChange() {
    return !dirty || window.confirm('Scartare le modifiche al piano KPI?')
  }

  function changeYear(year: string) {
    if (!allowChange()) return
    void run(async () => {
      setAnnual(await request<KpiYear>(endpoint + '/' + year))
      setSelected(null)
      setDirty(false)
    })
  }

  function addYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || newYear === null || !allowChange()) return
    void run(async () => {
      const created = await request<KpiYear>(endpoint, 'POST', { year: Number(newYear) })
      setYears(current => [...current, created.year].sort((a, b) => b - a))
      setAnnual(created)
      setNewYear(null)
      setSelected(null)
      setDirty(false)
      setNotice('Anno aggiunto.')
    })
  }

  function planPath(year: number, utente: string) {
    return `${endpoint}/${year}/people/${encodeURIComponent(utente)}`
  }

  function open(person: KpiYear['people'][number]) {
    if (!annual || (selected?.utente === person.utente) || !allowChange()) return
    void run(async () => {
      const plan = await request<Plan>(planPath(annual.year, person.utente))
      setDraft(plan.objectives.map(draftFrom))
      setQualitativeComment(plan.qualitativeComment ?? '')
      setSelected(person)
      setDirty(false)
    })
  }

  function change(index: number, key: keyof DraftObjective, value: string) {
    setDraft(current => current.map((item, i) => i === index ? { ...item, [key]: value } : item))
    setDirty(true)
  }

  const evaluation = inspect(draft)
  const initiativeCount = Math.max(0, draft.length - fixedObjectives.length)

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!annual || !selected || busy || evaluation.invalid) return
    void run(async () => {
      const saved = await request<Plan>(planPath(annual.year, selected.utente), 'PUT', {
        objectives: evaluation.objectives, qualitativeComment,
      })
      const summary = summarize(saved.objectives)
      setAnnual({ ...annual, people: annual.people.map(person => person.utente === saved.utente ? { ...person, summary } : person) })
      setDraft(saved.objectives.map(draftFrom))
      setQualitativeComment(saved.qualitativeComment ?? '')
      setDirty(false)
      setNotice('Piano salvato.')
    })
  }

  return <main className="frame">
    <div className="heading"><h1>KPI</h1>
      {ready && newYear === null && <button className="primary" disabled={busy} onClick={() => {
        setError('')
        setNewYear(String(years.length ? Math.min(years[0] + 1, 9999) : new Date().getFullYear()))
      }}>+ Nuovo anno</button>}
    </div>
    {!ready && busy && <p role="status">Caricamento…</p>}
    {!ready && !busy && <button onClick={load}>Riprova</button>}
    {newYear !== null && <form className="panel review-panel kpi-year-form" onSubmit={addYear}>
      <label>Nuovo anno KPI<input type="number" min="1900" max="9999" step="1" required value={newYear}
        disabled={busy} onChange={event => setNewYear(event.target.value)} /></label>
      <button className="primary" disabled={busy}>Aggiungi anno</button>
      <button type="button" disabled={busy} onClick={() => { setNewYear(null); setError('') }}>Annulla</button>
    </form>}
    {error && <p role="alert" className="error">{error}</p>}
    {notice && !selected && <p role="status" className="notice">{notice}</p>}
    {ready && !annual && <p>Nessun anno KPI. Usa <strong>Nuovo anno</strong> per iniziare.</p>}
    {annual && <>
      <div className="review-toolbar">
        <label htmlFor="kpi-year">Anno</label>
        <select id="kpi-year" value={annual.year} disabled={busy} onChange={event => changeYear(event.target.value)}>
          {years.map(year => <option key={year}>{year}</option>)}
        </select>
      </div>
      {annual.people.length === 0 ? <p>Aggiungi una persona in Anagrafica per compilare il suo piano KPI.</p> :
        <div className="panel table-scroll"><table>
          <caption className="visually-hidden">Riepilogo KPI {annual.year}</caption>
          <thead><tr>{['Persona', 'Pesi', 'Obiettivi valutati', 'Stato', 'Risultato'].map(label =>
            <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{annual.people.map(person => <tr key={person.utente}>
            <th scope="row"><button className="person" disabled={busy} aria-pressed={selected?.utente === person.utente}
              onClick={() => open(person)}>{person.nominativo}</button><small>{person.utente}</small></th>
            <td>{person.summary ? weightFormat.format(person.summary.weightTotal / 100) + '%' : '—'}</td>
            <td>{person.summary ? `${person.summary.evaluated} / ${person.summary.count}` : '—'}</td>
            <td>{person.summary ? status(person.summary) : 'Da impostare'}</td>
            <td>{person.summary?.result != null ? resultFormat.format(person.summary.result / 100) : '—'}</td>
          </tr>)}</tbody>
        </table></div>}
      {selected && <section className="panel review-panel" ref={detail} tabIndex={-1} aria-labelledby="kpi-plan-title">
        <div className="action-heading">
          <h2 id="kpi-plan-title">{selected.nominativo} · KPI {annual.year}</h2>
          <button type="button" disabled={busy} onClick={() => {
            if (allowChange()) { setSelected(null); setDirty(false); setError(''); setNotice('') }
          }}>Chiudi piano</button>
        </div>
        <p>Puoi salvare il piano con i punteggi vuoti. Usa un punteggio da 65 a 135 quando valuti un obiettivo.</p>
        <div className="review-toolbar">
          <strong>Pesi {weightFormat.format(evaluation.summary.weightTotal / 100)}%</strong>
          <span>{evaluation.summary.evaluated} di {draft.length} obiettivi valutati</span>
          <label>Risultato complessivo <output>{!evaluation.invalid && evaluation.summary.result !== null
            ? resultFormat.format(evaluation.summary.result / 100) : '—'}</output></label>
        </div>
        <form onSubmit={save}>
          <div className="table-scroll"><table className="kpi-objectives">
            <thead><tr>{['Obiettivo', 'Peso %', 'Punteggio', 'Valutazione'].map(label =>
              <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{draft.map((item, index) => {
              const fixed = index < fixedObjectives.length
              const label = fixed ? item.name : 'Iniziativa ' + (index - fixedObjectives.length + 1)
              const check = evaluation.checks[index]
              return <tr key={index}>
                <th scope="row">{fixed ? label : <>
                  <input aria-label={label} placeholder={label} value={item.name} disabled={busy}
                    aria-invalid={check.name} onChange={event => change(index, 'name', event.target.value)} />
                  <button type="button" className="person" disabled={busy} aria-label={'Rimuovi ' + label} onClick={() => {
                    setDraft(current => current.filter((_, i) => i !== index)); setDirty(true)
                  }}>Rimuovi</button>
                </>}</th>
                <td><input aria-label={'Peso · ' + label} aria-invalid={check.weight} inputMode="decimal" value={item.weight}
                  disabled={busy} onChange={event => change(index, 'weight', event.target.value)} />
                  {check.weight && <small className="error">Usa un peso tra 0 e 100%.</small>}</td>
                <td><input aria-label={'Punteggio · ' + label} aria-invalid={check.score} inputMode="decimal" value={item.score}
                  disabled={busy} onChange={event => change(index, 'score', event.target.value)} />
                  {check.score && <small className="error">Usa un punteggio da 65 a 135.</small>}</td>
                <td>{outcome(check.value.score)}</td>
              </tr>
            })}</tbody>
          </table></div>
          <div className="review-toolbar">
            <button type="button" disabled={busy || initiativeCount >= initiativeLimit} onClick={() => {
              setDraft(current => [...current, { name: '', weight: '', score: '' }]); setDirty(true)
            }}>+ Iniziativa</button>
            <span>{initiativeCount} di {initiativeLimit} iniziative</span>
          </div>
          <label className="kpi-comment">Valutazione qualitativa di fine anno
            <textarea rows={5} value={qualitativeComment} disabled={busy}
              onChange={event => { setQualitativeComment(event.target.value); setDirty(true) }} />
            <small>Facoltativa durante la definizione degli obiettivi.</small>
          </label>
          <div className="review-toolbar">
            <button className="primary" disabled={busy || evaluation.invalid}>Salva piano</button>
          </div>
          {evaluation.checks.some(row => row.name) && <p className="error">Inserisci una descrizione per ogni iniziativa oppure rimuovi quelle vuote.</p>}
          {notice && <p role="status" className="notice">{notice}</p>}
        </form>
      </section>}
    </>}
  </main>
}
