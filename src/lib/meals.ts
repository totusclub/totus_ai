/**
 * Meal codes never reach the customer — the UI shows plain Russian.
 * Mirrors MEAL_LABELS on the server.
 */
const MEAL_LABELS: Record<string, string> = {
  UAI: 'Ультра всё включено',
  'UAI+': 'Ультра всё включено',
  AI: 'Всё включено',
  'AI+': 'Всё включено',
  AIP: 'Всё включено',
  FB: 'Полный пансион',
  'FB+': 'Полный пансион',
  HB: 'Полупансион',
  'HB+': 'Полупансион',
  BB: 'Завтраки',
  RO: 'Без питания',
  OB: 'Без питания',
  SC: 'Без питания',
}

export function mealLabel(code: string): string {
  return MEAL_LABELS[code.trim().toUpperCase()] ?? code.trim()
}
