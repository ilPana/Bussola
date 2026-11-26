import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { emptyPerson, groups, performances, required } from './people.ts'
import type { Person } from './people.ts'
import { ApiError, request } from './api.ts'
import type { FieldErrors } from './api.ts'
import { ageOn, localDate } from './calendar.ts'
import { PeopleReview } from './people-review.tsx'
import { CompetencyMapping } from './competency-mapping.tsx'
import { KpiPanel } from './kpi-panel.tsx'
import './style.css'

function Directory() {
  const [people, setPeople] = useState<Person[]>([])
  const [draft, setDraft] = useState<Person | null>(null)
  const [editing, setEditing] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  async function load() {
    setLoading(true)
    setError('')
    try {
      setPeople(await request<Person[]>('/api/people'))
    } catch {
      setError('Impossibile caricare l’anagrafica.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  function open(person?: Person) {
    setNotice('')
    setError('')
    setFieldErrors({})
    setEditing(person !== undefined)
    setDraft({ ...(person ?? emptyPerson) })
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || saving) return
    setSaving(true)
    setError('')
    setFieldErrors({})
    try {
      const path = editing ? '/api/people/' + encodeURIComponent(draft.utente) : '/api/people'
      const saved = await request<Person>(path, editing ? 'PATCH' : 'POST', draft)
      setPeople(current => [...current.filter(person => person.utente !== saved.utente), saved]
        .sort((a, b) => a.nominativo.localeCompare(b.nominativo, 'it')))
      setDraft(null)
      setNotice('Scheda salvata.')
    } catch (issue) {
      setError(issue instanceof ApiError ? issue.message : 'Impossibile salvare la scheda.')
      if (issue instanceof ApiError) setFieldErrors(issue.fields)
    } finally {
      setSaving(false)
    }
  }

  const query = search.trim().toLocaleLowerCase('it')
  const visible = people.filter(person =>
    [person.nominativo, person.utente].some(value => value.toLocaleLowerCase('it').includes(query)),
  )

  return <>
    <main className="frame">
      {draft ? <>
        <button className="back" disabled={saving} onClick={() => { setDraft(null); setError('') }}>← Anagrafica</button>
        <h1>{editing ? draft.nominativo : 'Nuova persona'}</h1>
        <form onSubmit={save} className="form">
          <p>Utente e Nominativo sono obbligatori.</p>
          {groups.map(group => <fieldset key={group.title} disabled={saving}>
            <legend>{group.title}</legend>
            <div className="fields">
              {group.fields.map(([key, label, type]) => {
                const list = 'suggestions-' + key
                const shared = {
                  id: key,
                  value: draft[key],
                  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
                    setDraft({ ...draft, [key]: event.target.value })
                    setFieldErrors(current => ({ ...current, [key]: undefined }))
                  },
                  'aria-invalid': Boolean(fieldErrors[key]),
                  'aria-describedby': fieldErrors[key] ? key + '-error' : undefined,
                }
                return <div className="field" key={key}>
                  <label htmlFor={key}>{label}</label>
                  {type === 'select'
                    ? <select {...shared}><option value="">—</option>{performances.map(value => <option key={value}>{value}</option>)}</select>
                    : <input {...shared}
                        type={type === 'date' || type === 'email' ? type : 'text'}
                        list={type === 'suggestion' ? list : undefined}
                        inputMode={type === 'money' || type === 'number' ? 'decimal' : undefined}
                        required={required.has(key)}
                        readOnly={key === 'utente' && editing} />}
                  {type === 'suggestion' && <datalist id={list}>
                    {[...new Set(people.map(person => person[key]).filter(Boolean))].sort().map(value => <option key={value} value={value} />)}
                  </datalist>}
                  {key === 'dataNascita' && draft.dataNascita && <small>Età: {ageOn(draft.dataNascita, localDate())}</small>}
                  {fieldErrors[key] && <small className="error" id={key + '-error'}>{fieldErrors[key]}</small>}
                </div>
              })}
            </div>
          </fieldset>)}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="form-actions"><button className="primary" disabled={saving}>{saving ? 'Salvataggio…' : 'Salva scheda'}</button>
            <button type="button" disabled={saving} onClick={() => { setDraft(null); setError('') }}>Annulla</button></div>
        </form>
      </> : <>
        <div className="heading"><div><h1>Anagrafica</h1><p>{people.length} {people.length === 1 ? 'persona' : 'persone'}</p></div>
          <button className="primary" onClick={() => open()} disabled={loading || Boolean(error)}>+ Nuova persona</button></div>
        {notice && <p role="status" className="notice">{notice}</p>}
        <section className="panel" aria-label="Elenco persone">
          <div className="filter"><label htmlFor="search">Cerca per nominativo o utente</label>
            <input id="search" type="search" value={search} onChange={event => setSearch(event.target.value)} />
          </div>
          {loading && <p className="message" role="status">Caricamento…</p>}
          {error && <div className="message"><p className="error" role="alert">{error}</p><button onClick={() => void load()}>Riprova</button></div>}
          {!loading && !error && (visible.length ? <div className="table-scroll"><table>
            <thead><tr>{['Nominativo', 'Utente', 'Ufficio', 'Codice ruolo', 'Prestazione'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{visible.map(person => <tr key={person.utente}>
              <td><button className="person" onClick={() => open(person)}>{person.nominativo}</button></td>
              <td>{person.utente}</td><td>{person.ufficio || '—'}</td>
              <td>{person.codiceRuolo || '—'}</td><td>{person.prestazione || '—'}</td>
            </tr>)}</tbody>
          </table></div> : <p className="message">{people.length ? 'Nessuna persona corrisponde alla ricerca.' : 'L’anagrafica è vuota.'}</p>)}
        </section>
      </>}
    </main>
  </>
}

function App() {
  const [section, setSection] = useState<'directory' | 'review' | 'competencies' | 'kpi'>('directory')
  return <>
    <header className="top">
      <div className="frame navigation">
        <div className="wordmark"><span aria-hidden="true">✦</span> Bussola</div>
        <nav aria-label="Sezioni">
          <button aria-current={section === 'directory' ? 'page' : undefined} onClick={() => setSection('directory')}>Anagrafica</button>
          <button aria-current={section === 'review' ? 'page' : undefined} onClick={() => setSection('review')}>People Review</button>
          <button aria-current={section === 'competencies' ? 'page' : undefined} onClick={() => setSection('competencies')}>Competenze</button>
          <button aria-current={section === 'kpi' ? 'page' : undefined} onClick={() => setSection('kpi')}>KPI</button>
        </nav>
      </div>
    </header>
    {section === 'directory' && <Directory />}
    {section === 'review' && <PeopleReview />}
    {section === 'competencies' && <CompetencyMapping />}
    {section === 'kpi' && <KpiPanel />}
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
