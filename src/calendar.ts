export function localDate() {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

export function ageOn(birthDate: string, date: string) {
  const [year, month, day] = birthDate.split('-').map(Number)
  const [currentYear, currentMonth, currentDay] = date.split('-').map(Number)
  const birthdayPending = currentMonth < month || (currentMonth === month && currentDay < day)
  return currentYear - year - Number(birthdayPending)
}

export function displayDate(date: string) {
  return date.split('-').reverse().join('/')
}
