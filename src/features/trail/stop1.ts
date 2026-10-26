// Content and layout for the first stop. The correct answer is not here, it is checked by the database.

export const STOP_NUMBER = 1

export type ObjectId = 'bench' | 'barbecue_pit' | 'shelter' | 'lamp_post' | 'palm_tree'

// Where the Today line sits, as a fraction of the camera view's height from the top.
export const TODAY_LINE_Y = 0.72

// How far the 2100 line sits above the Today line, as a fraction of the camera view's height.
// An illustration, not a measurement. Adjust it after a visit to the park.
export const LINE_2100_HEIGHT = 0.32

export const LINE_2100_Y = TODAY_LINE_Y - LINE_2100_HEIGHT

export interface StopObject {
  id: ObjectId
  name: string
  tag: string
  // Position in the camera view as fractions of its width and height from the top left.
  x: number
  y: number
}

// Benches and barbecue pits sit between the two lines, so they are under water in 2100.
// The shelter, lamp post and palm tree sit above the 2100 line, the palm tree highest.
export const objects: StopObject[] = [
  { id: 'bench', name: 'Bench', tag: 'Bench. Half a metre tall. Behind the sea wall.', x: 0.25, y: 0.62 },
  { id: 'barbecue_pit', name: 'Barbecue pit', tag: 'Barbecue pit. 1 metre tall. No wall in front.', x: 0.75, y: 0.54 },
  { id: 'shelter', name: 'Shelter', tag: 'Shelter. 3 metres tall. Behind the sea wall.', x: 0.28, y: 0.34 },
  { id: 'lamp_post', name: 'Lamp post', tag: 'Lamp post. 6 metres tall. No wall in front.', x: 0.78, y: 0.25 },
  { id: 'palm_tree', name: 'Palm tree', tag: 'Palm tree. 9 metres tall. Behind the sea wall.', x: 0.5, y: 0.1 },
]

export const clues = [
  "The water's higher than anything you could sit on now.",
  "It's still standing, but it isn't the tallest thing I can see.",
  'The old wall still stands in front of it. Where nobody built a wall, the ground is gone.',
]

export const introAll = "A broken signal is coming through. It says it's from East Coast Park, in the year 2100."
export const introInterpreter = 'You have the message. Read the clues out loud and work out where the sender is.'
export const introInvestigator =
  "You have the scanner. Line up Today with the water's edge, then tell your partner what you see."

export const wrongAnswerText = "The signal fades, that's not it"
export const rightAnswerText = 'Found it'

export const lineLabelToday = 'Today'
export const lineLabel2100 = '2100'
export const lineNote = 'Illustration, not a measurement'
