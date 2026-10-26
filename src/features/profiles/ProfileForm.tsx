import { useState, type FormEvent } from 'react'
import type { Profile } from './ProfileCard'
import { validateProfile, type ProfileErrors, type ProfileValues } from './profileValidation'

interface Props {
  initial?: Profile
  submitLabel: string
  onSave: (values: Profile) => Promise<string | null>
  onCancel?: () => void
}

// Shared by profile setup and profile editing. Input is kept after any failure.
export function ProfileForm({ initial, submitLabel, onSave, onCancel }: Props) {
  const [values, setValues] = useState<ProfileValues>({
    name: initial?.name ?? '',
    age: initial ? String(initial.age) : '',
    gender: initial?.gender ?? '',
    bio: initial?.bio ?? '',
  })
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [saveError, setSaveError] = useState('')
  const [pending, setPending] = useState(false)

  function change(field: keyof ProfileValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const result = validateProfile(values)
    setErrors(result.errors)
    setSaveError('')
    if (Object.keys(result.errors).length > 0) return

    setPending(true)
    const message = await onSave(result.clean)
    // On success the parent moves on and this form unmounts.
    if (message) {
      setSaveError(message)
      setPending(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <label className="field">
        <span>Name</span>
        <input value={values.name} onChange={(e) => change('name', e.target.value)} autoComplete="given-name" />
        {errors.name && <small className="field__error">{errors.name}</small>}
      </label>
      <label className="field">
        <span>Age</span>
        <input value={values.age} onChange={(e) => change('age', e.target.value)} inputMode="numeric" />
        {errors.age && <small className="field__error">{errors.age}</small>}
      </label>
      <label className="field">
        <span>Gender</span>
        <input value={values.gender} onChange={(e) => change('gender', e.target.value)} />
        {errors.gender && <small className="field__error">{errors.gender}</small>}
      </label>
      <label className="field">
        <span>Bio</span>
        <textarea value={values.bio} onChange={(e) => change('bio', e.target.value)} rows={4} />
        {errors.bio && <small className="field__error">{errors.bio}</small>}
      </label>
      {saveError && (
        <p className="form-message form-message--error" role="alert">
          {saveError}
        </p>
      )}
      <div className="actions">
        {onCancel && (
          <button type="button" className="button button--secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
        )}
        <button type="submit" className="button button--primary" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
