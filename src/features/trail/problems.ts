// The problems on the board. Only the playable ones have a card link name and a stop number.
export interface Problem {
  title: string
  // What the printed card names. Undefined while the problem is not designed.
  landmark?: string
  // The name in the card link, /scan/<cardLink>.
  cardLink?: string
  stop?: number
}

export const problems: Problem[] = [
  {
    title: 'Storm waves are eating the shore',
    landmark: "East Coast Park's rock walls and breakwaters",
    cardLink: 'storm-waves',
    stop: 1,
  },
  { title: 'The sea is rising' },
  { title: 'Low land floods in storms' },
]

export const boardHeading = 'The coast is in danger'
export const boardIntro =
  'A message is coming through from East Coast Park, in the year 2100. Our coast is in danger. You still have time to choose better than we did. Pick a problem to tackle together.'

export const problemForCard = (cardLink: string) => problems.find((problem) => problem.cardLink === cardLink)
