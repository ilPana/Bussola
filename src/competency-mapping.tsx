import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, request } from './api.ts'
import { categories, levels } from './competencies.ts'
import type { Assessment, Entry, Kind, Mapping } from './competencies.ts'

const endpoint = '/api/competencies'
const kinds = { application: 'Applicazioni', skill: 'Skill' } as const
const viewLabels = { matrix: 'Matrice', entry: 'Per voce', person: 'Per persona' } as const
type View = keyof typeof viewLabels
type Member = Mapping['people'][number]
type CatalogEdit = { kind: Kind; entry?: Entry }
type AssessmentEdit = { entry: Entry; person: Member }

function entryDetail(entry: Entry) {
  return entry.kind === 'application' ? entry.description : categories[entry.category]
}

function AssessmentDialog({ edit, assessment, busy, error, onClose, onSave }: {
  edit: AssessmentEdit
  assessment?: Assessment
  busy: boolean
  error: string
  onClose: () => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="mapping-dialog" aria-labelledby="assessment-title"
    onCancel={event => { if (busy) event.preventDefault() }} onClose={onClose}>
    <h2 id="assessment-title">{edit.person.nominativo} · {edit.entry.name}</h2>
    <p>{entryDetail(edit.entry)}</p>
    <form onSubmit={onSave}>
      <label>Livello<select name="level" defaultValue={assessment?.level ?? levels[0]} disabled={busy}>
        {levels.map(level => <option key={level}>{level}</option>)}
      </select></label>
      <label>Nota facoltativa<textarea name="note" rows={3} defaultValue={assessment?.note ?? ''} disabled={busy} /></label>
      <div className="form-actions"><button className="primary" disabled={busy}>Salva valutazione</button>
        <button type="button" disabled={busy} onClick={onClose}>Annulla</button></div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  </dialog>
}

function Catalog({ entries, kind, edit, busy, onEdit, onSave }: {
  entries: Entry[]
  kind: Kind
  edit: CatalogEdit | null
  busy: boolean
  onEdit: (value: CatalogEdit | null) => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
}) {
  return <details className="panel review-panel">
    <summary>Catalogo applicazioni e skill</summary>
    <div className="fields catalog-grid">
      {Object.entries(kinds).map(([key, title]) => {
        const catalogKind = key as Kind
        const active = catalogKind === kind
        return <section key={key}>
          <div className="action-heading"><h3>{title}</h3>
            <button disabled={busy} onClick={() => onEdit({ kind: catalogKind })}>
              {catalogKind === 'application' ? '+ Nuova applicazione' : '+ Nuova skill'}
            </button></div>
          <ul className="mapping-entries">{entries.filter(entry => entry.kind === key).map(entry => <li key={entry.id}>
            <span><strong>{entry.name}</strong><small>{entryDetail(entry)}</small></span>
            <button disabled={busy} onClick={() => onEdit({ kind: entry.kind, entry })}
              aria-label={`Modifica ${entry.name} (${entry.kind === 'application' ? 'applicazione' : 'skill'})`}>Modifica</button>
          </li>)}</ul>
          {active && edit && <form className="catalog-form" key={edit.entry?.id ?? key} onSubmit={onSave}>
            <h4>{edit.entry ? 'Modifica voce' : catalogKind === 'application' ? 'Nuova applicazione' : 'Nuova skill'}</h4>
            <label>Nome<input name="name" required defaultValue={edit.entry?.name ?? ''} disabled={busy} /></label>
            {catalogKind === 'application'
              ? <label>Descrizione<textarea name="description" rows={3} required
                defaultValue={edit.entry?.description ?? ''} disabled={busy} /></label>
              : <label>Categoria<select name="category" defaultValue={edit.entry?.category ?? 'hard'} disabled={busy}>
                {Object.entries(categories).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
              </select></label>}
            <div className="form-actions"><button className="primary" disabled={busy}>Salva voce</button>
              <button type="button" disabled={busy} onClick={() => onEdit(null)}>Annulla</button></div>
          </form>}
        </section>
      })}
    </div>
  </details>
}

export function CompetencyMapping() {
  const [data, setData] = useState<Mapping | null>(null)
  const [view, setView] = useState<View>('matrix')
  const [kind, setKind] = useState<Kind>('application')
  const [entryId, setEntryId] = useState('')
  const [utente, setUtente] = useState('')
  const [transposed, setTransposed] = useState(false)
  const [catalogEdit, setCatalogEdit] = useState<CatalogEdit | null>(null)
  const [assessmentEdit, setAssessmentEdit] = useState<AssessmentEdit | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

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
    void run(async () => setData(await request<Mapping>(endpoint)))
  }

  useEffect(load, [])

  function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!catalogEdit || busy) return
    const body = { ...Object.fromEntries(new FormData(event.currentTarget)), kind: catalogEdit.kind }
    const id = catalogEdit.entry?.id
    void run(async () => {
      const saved = await request<Entry>(id ? endpoint + '/' + id : endpoint, id ? 'PATCH' : 'POST', body)
      setData(current => current && { ...current, entries: [...current.entries.filter(entry => entry.id !== saved.id), saved]
        .sort((a, b) => a.name.localeCompare(b.name, 'it')) })
      if (kind !== saved.kind) setEntryId('')
      setKind(saved.kind)
      setCatalogEdit(null)
      setNotice('Voce salvata.')
    })
  }

  function saveAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!assessmentEdit || busy) return
    const { entry, person } = assessmentEdit
    const body = { ...Object.fromEntries(new FormData(event.currentTarget)), utente: person.utente }
    void run(async () => {
      const saved = await request<Assessment>(`${endpoint}/${entry.id}/assessment`, 'PUT', body)
      setData(current => current && { ...current, assessments: [
        ...current.assessments.filter(row => row.entryId !== saved.entryId || row.utente !== saved.utente), saved,
      ] })
      setAssessmentEdit(null)
      setNotice('Valutazione salvata.')
    })
  }

  const index = new Map<number, Map<string, Assessment>>()
  for (const row of data?.assessments ?? []) {
    let ratings = index.get(row.entryId)
    if (!ratings) {
      ratings = new Map()
      index.set(row.entryId, ratings)
    }
    ratings.set(row.utente, row)
  }
  const lookup = (entry: Entry, person: Member) => index.get(entry.id)?.get(person.utente)
  const catalog = data?.entries.filter(entry => entry.kind === kind) ?? []
  const entries = catalog.filter(entry => !entryId || entry.id === Number(entryId))
  const people = data?.people.filter(person => !utente || person.utente === utente) ?? []
  const groups = [
    { title: 'Applicazioni', entries: data?.entries.filter(entry => entry.kind === 'application') ?? [] },
    ...Object.entries(categories).map(([category, title]) => ({
      title, entries: data?.entries.filter(entry => entry.category === category) ?? [],
    })),
  ]

  function badge(entry: Entry, person: Member) {
    const level = lookup(entry, person)?.level ?? levels[0]
    return <button className={`mapping-badge mapping-level-${levels.indexOf(level)}`} disabled={busy}
      aria-label={`${person.nominativo} · ${entry.name} · ${level}`}
      onClick={() => { setError(''); setAssessmentEdit({ entry, person }) }}>{level}</button>
  }

  function matrix() {
    return <div className="panel table-scroll"><table>
      <caption className="visually-hidden">Matrice {kind === 'application' ? 'delle applicazioni' : 'delle skill'}</caption>
      {transposed ? <>
        <thead><tr><th scope="col">{kind === 'application' ? 'Applicazione' : 'Skill'}</th>
          {people.map(person => <th key={person.utente} scope="col">{person.nominativo}</th>)}</tr></thead>
        <tbody>{entries.map(entry => <tr key={entry.id}><th scope="row">{entry.name}
          {entry.category && <small>{categories[entry.category]}</small>}</th>
          {people.map(person => <td key={person.utente}>{badge(entry, person)}</td>)}</tr>)}</tbody>
      </> : <>
        <thead><tr><th scope="col">Persona</th>{entries.map(entry => <th key={entry.id} scope="col">{entry.name}
          {entry.category && <small>{categories[entry.category]}</small>}</th>)}</tr></thead>
        <tbody>{people.map(person => <tr key={person.utente}><th scope="row">{person.nominativo}</th>
          {entries.map(entry => <td key={entry.id}>{badge(entry, person)}</td>)}</tr>)}</tbody>
      </>}
    </table></div>
  }

  return <main className="frame">
    <h1>Competenze</h1>
    {!data && busy && <p role="status">Caricamento…</p>}
    {error && !assessmentEdit && <p className="error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {!data && !busy && <button onClick={load}>Riprova</button>}
    {data && <>
      <nav className="review-toolbar" aria-label="Viste delle competenze">
        {Object.entries(viewLabels).map(([key, label]) => <button key={key} aria-pressed={view === key} disabled={busy}
          onClick={() => setView(key as View)}>{key === 'entry' ? (kind === 'application' ? 'Per applicazione' : 'Per skill') : label}</button>)}
      </nav>
      <div className="mapping-filters">
        {view !== 'person' && <>
          <label>Mappa<select value={kind} onChange={event => { setKind(event.target.value as Kind); setEntryId('') }}>
            {Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <label>{kind === 'application' ? 'Applicazione' : 'Skill'}<select value={entryId} onChange={event => setEntryId(event.target.value)}>
            <option value="">Tutte</option>
            {catalog.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select></label>
        </>}
        <label>Persona<select value={utente} onChange={event => setUtente(event.target.value)}>
          <option value="">Tutte</option>
          {data.people.map(person => <option key={person.utente} value={person.utente}>{person.nominativo} ({person.utente})</option>)}
        </select></label>
        {view === 'matrix' && <button aria-pressed={transposed} onClick={() => setTransposed(current => !current)}>
          Scambia righe e colonne
        </button>}
      </div>
      {people.length === 0 && <p>Aggiungi una persona in Anagrafica per iniziare la mappatura.</p>}
      {view !== 'person' && entries.length === 0 && <p>Aggiungi una voce al catalogo per iniziare la mappatura.</p>}
      {view === 'matrix' && people.length > 0 && entries.length > 0 && matrix()}
      {view === 'entry' && entries.map(entry => {
        const autonomous = people.filter(person => {
          const level = lookup(entry, person)?.level
          return level === 'Autonomo' || level === 'Avanzato'
        })
        return <section className="panel review-panel" key={entry.id}>
          <h2>{entry.name}</h2><p>{entryDetail(entry)}</p>
          <p>Persone almeno autonome: <strong>{autonomous.map(person => person.nominativo).join(', ') || 'nessuna rilevata'}</strong></p>
          <ul className="mapping-entries">{people.map(person => <li key={person.utente}>
            <span>{person.nominativo}</span>{badge(entry, person)}
          </li>)}</ul>
        </section>
      })}
      {view === 'person' && <div className="fields mapping-people">{people.map(person => <section key={person.utente} className="panel review-panel">
        <h2>{person.nominativo}</h2>
        {groups.map(group => <section key={group.title}>
          <h3>{group.title}</h3>
          {group.entries.length === 0 ? <p>Nessuna voce in catalogo.</p> : <ul className="mapping-entries">
            {group.entries.map(entry => <li key={entry.id}><span>{entry.name}</span>{badge(entry, person)}</li>)}
          </ul>}
        </section>)}
      </section>)}</div>}
      <details className="mapping-levels"><summary>Significato dei livelli</summary><ul>
        <li><strong>Da valutare</strong> · La valutazione manca.</li>
        <li><strong>Assente</strong> · La conoscenza è stata valutata come assente.</li>
        <li><strong>Base</strong> · Gestisce attività semplici con affiancamento.</li>
        <li><strong>Autonomo</strong> · Gestisce le attività ricorrenti.</li>
        <li><strong>Avanzato</strong> · Gestisce casi complessi e può affiancare altre persone.</li>
      </ul></details>
      <Catalog entries={data.entries} kind={catalogEdit?.kind ?? kind} edit={catalogEdit} busy={busy}
        onEdit={value => { setError(''); setCatalogEdit(value) }} onSave={saveEntry} />
    </>}
    {assessmentEdit && <AssessmentDialog edit={assessmentEdit} assessment={lookup(assessmentEdit.entry, assessmentEdit.person)}
      busy={busy} error={error} onClose={() => { setError(''); setAssessmentEdit(null) }} onSave={saveAssessment} />}
  </main>
}
