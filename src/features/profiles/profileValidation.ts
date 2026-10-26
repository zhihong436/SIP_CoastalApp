export interface ProfileValues {
  name: string
  age: string
  gender: string
  bio: string
}

export type ProfileErrors = Partial<Record<keyof ProfileValues, string>>

// These limits match the check constraints on the profiles table.
export function validateProfile(values: ProfileValues) {
  const errors: ProfileErrors = {}
  const name = values.name.trim()
  const gender = values.gender.trim()
  const bio = values.bio.trim()
  const age = Number(values.age)

  if (name.length < 1 || name.length > 50) errors.name = 'Enter a name of up to 50 characters.'
  if (!values.age.trim() || !Number.isInteger(age) || age < 18 || age > 120) {
    errors.age = 'Enter a whole number from 18 to 120.'
  }
  if (gender.length < 1 || gender.length > 50) errors.gender = 'Enter up to 50 characters.'
  if (bio.length < 1 || bio.length > 300) errors.bio = 'Write a short bio of up to 300 characters.'

  return { errors, clean: { name, age, gender, bio } }
}
