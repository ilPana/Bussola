export const actionTypes = ['Promozione', 'Job Rotation', 'Formazione', 'Cambio di ruolo', 'Altro'] as const
export const actionStates = ['Proposta', 'Confermata', 'Sospesa', 'Completata', 'Annullata', 'Rinviata'] as const

export type ActionType = typeof actionTypes[number]
export type ActionState = typeof actionStates[number]
export type ActionReference = {
  id: number
  year: number
  type: ActionType
  proposal: string
}
export type StatusChange = {
  id: number
  previousState: ActionState
  state: ActionState
  changedOn: string
  note: string | null
}
export type ReviewAction = ActionReference & {
  utente: string
  state: ActionState
  plannedPeriod: string | null
  proposedLevel: string | null
  proposedRal: number | null
  proposedPtp: number | null
  initialLevel: string | null
  initialRal: number | null
  initialPtp: number | null
  source: ActionReference | null
  continuation: ActionReference | null
  history: StatusChange[]
}
export type PersonActions = { actions: ReviewAction[]; sources: ActionReference[] }
