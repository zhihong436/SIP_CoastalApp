// Content for the Hold the shore minigame. The plan is judged by the database, which holds the costs, the budget and
// the results table. The costs and budget below are only what the Interpreter reads.

export type SectionId = 'beach' | 'path' | 'car_park'
export type ProtectionId = 'sea_wall' | 'rock_slope' | 'breakwater' | 'beach_plants'
export type ResultId = 'safe' | 'safe_with_cost' | 'lost'

// A section holds a protection, or null for Empty.
export type Plan = Record<SectionId, ProtectionId | null>

export const sections: { id: SectionId; name: string; tag: string }[] = [
  { id: 'beach', name: 'Beach', tag: 'Beach. Gentle waves are slowly washing the sand away.' },
  { id: 'path', name: 'Path', tag: 'Park path. Strong storm waves hit the bank here directly.' },
  { id: 'car_park', name: 'Car park', tag: 'Car park. Very low ground. In a storm the sea flows right over it.' },
]

export const budget = 7

export const protections: { id: ProtectionId; name: string; cost: number; description: string }[] = [
  {
    id: 'sea_wall',
    name: 'Sea wall',
    cost: 3,
    description: 'A tall concrete wall. Stops waves and high water, but waves bounce off it and can strip the sand in front.',
  },
  {
    id: 'rock_slope',
    name: 'Rock slope',
    cost: 2,
    description: 'Big rocks piled in a slope. Soaks up the energy of strong waves. It covers whatever is under it.',
  },
  {
    id: 'breakwater',
    name: 'Breakwater',
    cost: 3,
    description: 'A rock barrier out at sea. Calms waves before they reach the shore, so sand stays on the beach.',
  },
  {
    id: 'beach_plants',
    name: 'Beach plants',
    cost: 1,
    description: 'Plants whose roots hold sand together. Works on gentle shores, but storm waves rip them out.',
  },
]

export const resultLabels: Record<ResultId, string> = {
  safe: 'Safe',
  safe_with_cost: 'Safe with a cost',
  lost: 'Lost',
}

// What happened in a section, by its protection. The database decides the result, this is only the text.
export const resultText: Record<SectionId, Record<ProtectionId | 'empty', string>> = {
  beach: {
    sea_wall: 'The wall held, but waves bounced off it and dragged the sand away. Your beach is gone.',
    rock_slope: 'The rocks held the shore, but they cover the sand. Nobody can sit on this beach now.',
    breakwater: 'The breakwater calmed the waves and sand built up behind it.',
    beach_plants: 'The roots held the sand on this gentle shore.',
    empty: 'The sand washed away.',
  },
  path: {
    sea_wall: 'The wall stopped the waves.',
    rock_slope: "The rocks soaked up the waves' energy.",
    breakwater: 'The waves were calm by the time they reached the bank.',
    beach_plants: 'Storm waves ripped the plants out and the bank collapsed.',
    empty: 'The waves broke through the bank.',
  },
  car_park: {
    sea_wall: 'The wall was high enough to keep the sea out.',
    rock_slope: 'The rocks broke the waves, but the sea rose over them and flooded the low ground.',
    breakwater: 'Calmer waves still flooded the low ground. A breakwater cannot stop high water.',
    beach_plants: 'The plants could not stop the water.',
    empty: 'The sea flooded the car park.',
  },
}

export const overBudgetText = 'That plan costs more than you have.'
export const feedbackHeld = 'The shore held.'
export const feedbackLost = 'Part of the shore was lost. Change your plan and try again.'

export const introAll =
  'Storm waves are eating the shore at East Coast Park. Protect three stretches of coast with only 7 points to spend.'
export const introInterpreter = 'You hold the plans. Explain each protection and its cost, and choose one for each stretch.'
export const introInvestigator = 'You have the scanner. Tap each stretch of shore and tell your partner what you see.'
