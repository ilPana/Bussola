export const levels = ['Da valutare', 'Assente', 'Base', 'Autonomo', 'Avanzato'] as const
export const categories = { hard: 'Hard skill', soft: 'Soft skill' } as const
export type Level = typeof levels[number]
export type Category = keyof typeof categories
export type Kind = 'application' | 'skill'
export type Entry = (
  | { kind: 'application'; description: string; category: null }
  | { kind: 'skill'; description: null; category: Category }
) & { id: number; name: string }
export type Assessment = { entryId: number; utente: string; level: Level; note: string | null }
export type Mapping = { entries: Entry[]; assessments: Assessment[]; people: { utente: string; nominativo: string }[] }
