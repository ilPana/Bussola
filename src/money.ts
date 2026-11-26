const euros = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

export function parseCents(value: string) {
  if (!/^\d+([.,]\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split(/[.,]/)
  const cents = Number(whole + fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

export function decimalAmount(cents: number) {
  return String(Math.trunc(cents / 100)) + '.' + String(cents % 100).padStart(2, '0')
}

export function displayAmount(cents: number | null) {
  return cents === null ? '—' : euros.format(cents / 100)
}
