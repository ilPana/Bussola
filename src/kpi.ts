export const fixedObjectives = [
  'Rispetto Budget Costi Competenza',
  'Rispetto Piano complessivo (Progetti + Rispetto Piano Evolutiva)',
  'Livelli servizio e Running complessivo',
  'Produttività (rispetto tempi e costi e qualità output)',
  'Valutazione 360 tra i componenti del core team',
  'Valutazione dei comportamenti',
  'Formazione normativa obbligatoria',
] as const

export const initiativeLimit = 5
export const fullWeight = 10000
export const minScore = 6500
export const maxScore = 13500

export type Objective = { name: string; weight: number | null; score: number | null }
export type Plan = { utente: string; objectives: Objective[]; qualitativeComment: string | null }
export type Summary = {
  weightTotal: number
  weightedCount: number
  evaluated: number
  count: number
  result: number | null
}
export type KpiYear = { year: number; people: { utente: string; nominativo: string; summary: Summary | null }[] }

export function newObjectives(): Objective[] {
  return fixedObjectives.map(name => ({ name, weight: null, score: null }))
}

export function summarize(objectives: readonly Objective[]): Summary {
  let weightTotal = 0
  let weightedCount = 0
  let evaluated = 0
  let weighted = 0
  for (const { weight, score } of objectives) {
    if (weight !== null) weightedCount++
    if (score !== null) evaluated++
    weightTotal += weight ?? 0
    weighted += (weight ?? 0) * (score ?? 0)
  }
  const count = objectives.length
  const result = weightTotal === fullWeight && weightedCount === count && evaluated === count
    ? Math.trunc(weighted / fullWeight) : null
  return { weightTotal, weightedCount, evaluated, count, result }
}
