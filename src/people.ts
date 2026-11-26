export const groups = [
  {
    title: 'Dati personali',
    fields: [
      ['utente', 'Utente', 'text'],
      ['idPersona', 'Id persona', 'text'],
      ['nominativo', 'Nominativo', 'text'],
      ['dataNascita', 'Data di nascita', 'date'],
      ['sesso', 'Sesso', 'text'],
      ['mail', 'Mail', 'email'],
      ['comuneResidenza', 'Comune residenza', 'text'],
    ],
  },
  {
    title: 'Incarico e sede',
    fields: [
      ['dataAssunzione', 'Data assunzione', 'date'],
      ['ufficio', 'Ufficio', 'suggestion'],
      ['dataIncarico', 'Data incarico', 'date'],
      ['codiceRuolo', 'Codice ruolo', 'suggestion'],
      ['dataRuolo', 'Data ruolo', 'date'],
      ['sedeLavoro', 'Sede di lavoro', 'suggestion'],
    ],
  },
  {
    title: 'Inquadramento e retribuzione',
    fields: [
      ['ral', 'RAL (€)', 'money'],
      ['mensilita', 'Mensilità', 'number'],
      ['livello', 'Livello', 'suggestion'],
      ['dataLivello', 'Data livello', 'date'],
      ['ultimoInterventoRal', 'Ultimo intervento RAL', 'date'],
      ['ptp', 'PTP (€)', 'money'],
      ['dataPtp', 'Data PTP', 'date'],
    ],
  },
  {
    title: 'Orario',
    fields: [
      ['prestazione', 'Prestazione', 'select'],
      ['oreSettimanali', 'Ore settimanali', 'number'],
    ],
  },
] as const

export type Field = typeof groups[number]['fields'][number][0]
export type Person = Record<Field, string>
export const fields = groups.flatMap(group => [...group.fields])
export const required = new Set<Field>(['utente', 'nominativo'])
export const performances = ['Tempo pieno', 'Part-time']
export const emptyPerson = Object.fromEntries(fields.map(([key]) => [key, ''])) as Person
