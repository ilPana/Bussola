import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, request } from './api.ts'
import { displayDate } from './calendar.ts'
import { decimalAmount, displayAmount } from './money.ts'
import { actionStates, actionTypes } from './review-actions.ts'
import type { ActionReference, ActionType, PersonActions, ReviewAction } from './review-actions.ts'

type Props = {
  year: number
  utente: string
  focusedAction: number | null
  disabled: boolean
  onCountChange: (count: number) => void
  onNavigate: (action: ActionReference) => void
}

function PromotionFields({ action }: { action?: ReviewAction }) {
  return <>
    <label>Livello proposto<input name="proposedLevel" required defaultValue={action?.proposedLevel ?? ''} /></label>
    <label>RAL proposta (€)<input name="proposedRal" inputMode="decimal"
      defaultValue={action?.proposedRal != null ? decimalAmount(action.proposedRal) : ''} /></label>
    <label>PTP proposto (€)<input name="proposedPtp" inputMode="decimal"
      defaultValue={action?.proposedPtp != null ? decimalAmount(action.proposedPtp) : ''} /></label>
  </>
}

function StateOptions() {
  return actionStates.map(state => <option key={state}>{state}</option>)
}

export function ActionPanel({ year, utente, focusedAction, disabled, onCountChange, onNavigate }: Props) {
  const endpoint = `/api/reviews/${year}/people/${encodeURIComponent(utente)}/actions`
  const [data, setData] = useState<PersonActions | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [type, setType] = useState<ActionType>('Promozione')
  const [proposal, setProposal] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const focused = useRef<HTMLElement>(null)
  const locked = busy || disabled

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
    void run(async () => setData(await request<PersonActions>(endpoint)))
  }

  useEffect(load, [endpoint])
  useEffect(() => { focused.current?.focus() }, [focusedAction, data !== null])

  function submit(form: HTMLFormElement, path: string, method: string, onSaved: (action: ReviewAction) => void, message: string) {
    const body: Record<string, unknown> = Object.fromEntries(new FormData(form))
    if (typeof body.sourceId === 'string') body.sourceId = body.sourceId ? Number(body.sourceId) : null
    void run(async () => {
      const saved = await request<ReviewAction>(path, method, body)
      onSaved(saved)
      setNotice(message)
    })
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!data || locked) return
    submit(event.currentTarget, endpoint, 'POST', saved => {
      const actions = [...data.actions, saved]
      setData({ actions, sources: data.sources.filter(source => source.id !== saved.source?.id) })
      onCountChange(actions.length)
      setCreating(false)
    }, 'Azione aggiunta.')
  }

  function update(event: FormEvent<HTMLFormElement>, action: ReviewAction, statusChange: boolean) {
    event.preventDefault()
    if (!data || locked) return
    const form = event.currentTarget
    const path = '/api/actions/' + action.id
    submit(form, statusChange ? path + '/status-changes' : path, statusChange ? 'POST' : 'PATCH', saved => {
      setData({ ...data, actions: data.actions.map(row => row.id === saved.id ? saved : row) })
      if (statusChange) form.reset()
      else setEditing(null)
    }, statusChange ? 'Stato aggiornato.' : 'Valori proposti aggiornati.')
  }

  return <section className="actions-section" aria-labelledby="actions-heading">
    <div className="action-heading">
      <h3 id="actions-heading">Azioni</h3>
      {data && !creating && <button className="primary" disabled={locked} onClick={() => {
        setType('Promozione')
        setProposal('')
        setSourceId('')
        setCreating(true)
      }}>+ Nuova azione</button>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {!data && (busy ? <p role="status">Caricamento delle azioni…</p> : <button onClick={load}>Riprova</button>)}
    {data?.actions.length === 0 && !creating && <p>Nessuna azione inserita.</p>}
    {creating && <form className="action-card" onSubmit={add}>
      <fieldset disabled={locked}>
        <legend>Nuova azione</legend>
        {Boolean(data?.sources.length) && <label>Riprende un’azione rinviata
          <select name="sourceId" value={sourceId} onChange={event => {
            const value = event.target.value
            setSourceId(value)
            const source = data?.sources.find(row => row.id === Number(value))
            if (source) {
              setType(source.type)
              setProposal(source.proposal)
            }
          }}><option value="">Nessuna</option>
            {data?.sources.map(source => <option key={source.id} value={source.id}>
              {source.year} · {source.type} · {source.proposal}
            </option>)}
          </select>
        </label>}
        <div className="fields action-fields">
          <label>Tipo<select name="type" value={type} onChange={event => setType(event.target.value as ActionType)}>
            {actionTypes.map(value => <option key={value}>{value}</option>)}
          </select></label>
          <label>Stato iniziale<select name="state"><StateOptions /></select></label>
          <label>Periodo previsto<input name="plannedPeriod" placeholder="Es. secondo trimestre" /></label>
        </div>
        <label>Proposta iniziale<textarea name="proposal" rows={3} required value={proposal}
          onChange={event => setProposal(event.target.value)} /></label>
        {type === 'Promozione' && <div className="fields action-fields"><PromotionFields /></div>}
      </fieldset>
      <div className="form-actions"><button className="primary" disabled={locked}>Salva azione</button>
        <button type="button" disabled={locked} onClick={() => { setCreating(false); setError('') }}>Annulla</button></div>
    </form>}
    {data?.actions.map(action => <article key={action.id} className="action-card" tabIndex={-1}
      ref={action.id === focusedAction ? focused : undefined} aria-labelledby={`action-${action.id}`}>
      <div className="action-heading"><h4 id={`action-${action.id}`}>{action.type}</h4>
        <span className="action-state">{action.state}</span></div>
      <p className="proposal"><strong>Proposta iniziale</strong><br />{action.proposal}</p>
      {action.plannedPeriod && <p>Periodo previsto: {action.plannedPeriod}</p>}
      {action.source && <p>Azione di origine <button className="person" disabled={locked}
        onClick={() => onNavigate(action.source!)}>{action.source.year} · {action.source.type}</button></p>}
      {action.continuation && <p>Ripresa nella review <button className="person" disabled={locked}
        onClick={() => onNavigate(action.continuation!)}>{action.continuation.year} · {action.continuation.type}</button></p>}
      {action.type === 'Promozione' && <>
        <dl className="fields">
          <div><dt>Livello proposto</dt><dd>{action.proposedLevel}</dd></div>
          <div><dt>RAL proposta</dt><dd>{displayAmount(action.proposedRal)}</dd></div>
          <div><dt>PTP proposto</dt><dd>{displayAmount(action.proposedPtp)}</dd></div>
        </dl>
        {(action.initialLevel !== action.proposedLevel || action.initialRal !== action.proposedRal || action.initialPtp !== action.proposedPtp)
          && <details><summary>Valori della proposta iniziale</summary>
            <dl className="fields">
              <div><dt>Livello</dt><dd>{action.initialLevel}</dd></div>
              <div><dt>RAL</dt><dd>{displayAmount(action.initialRal)}</dd></div>
              <div><dt>PTP</dt><dd>{displayAmount(action.initialPtp)}</dd></div>
            </dl>
          </details>}
        {editing === action.id
          ? <form onSubmit={event => update(event, action, false)}>
            <fieldset disabled={locked}><legend>Valori proposti</legend>
              <div className="fields"><PromotionFields action={action} /></div>
            </fieldset>
            <div className="form-actions"><button className="primary" disabled={locked}>Salva valori</button>
              <button type="button" disabled={locked} onClick={() => setEditing(null)}>Annulla</button></div>
          </form>
          : <button disabled={locked} onClick={() => setEditing(action.id)}>Modifica valori proposti</button>}
      </>}
      {action.history.length > 0 && <div className="action-history">
        <h5>Cronologia</h5>
        <ol>{action.history.map(change => <li key={change.id}>
          <time dateTime={change.changedOn}>{displayDate(change.changedOn)}</time>
          {' · '}{change.previousState} → {change.state}
          {change.note && <div className="proposal">{change.note}</div>}
        </li>)}</ol>
      </div>}
      {!action.continuation && <form key={action.state} className="status-form" onSubmit={event => update(event, action, true)}>
        <label>Nuovo stato<select name="state" defaultValue={action.state} disabled={locked}><StateOptions /></select></label>
        <label>Nota facoltativa<input name="note" disabled={locked} /></label>
        <button disabled={locked}>Salva stato</button>
      </form>}
    </article>)}
  </section>
}
