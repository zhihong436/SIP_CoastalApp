import { AlertIcon, CheckIcon, CrossIcon } from '../../components/Icons'
import { resultLabels, type ResultId } from './holdTheShore'

// The word and the icon carry the result as well as the colour.
export function ResultBadge({ result }: { result: ResultId }) {
  return (
    <span className={`result-badge result-badge--${result}`}>
      {result === 'safe' && <CheckIcon size={16} />}
      {result === 'safe_with_cost' && <AlertIcon />}
      {result === 'lost' && <CrossIcon size={16} />}
      {resultLabels[result]}
    </span>
  )
}
