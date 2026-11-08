import { useId } from 'react'

// Two original coastal scenes for the sign-in and empty Discover screens.
// They are decorative, so the copy beside them carries the meaning.

export function ShorelineArt() {
  return (
    <svg viewBox="0 0 720 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="shore-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eaf2f2" />
          <stop offset="1" stopColor="var(--color-mist)" />
        </linearGradient>
        <linearGradient id="shore-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b8990" />
          <stop offset="1" stopColor="var(--color-ocean)" />
        </linearGradient>
        <linearGradient id="shore-sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0e4ca" />
          <stop offset="1" stopColor="#e5d3af" />
        </linearGradient>
      </defs>

      <rect width="720" height="320" fill="url(#shore-sky)" />
      <circle cx="568" cy="92" r="62" fill="var(--color-coral)" opacity="0.12" />
      <circle cx="568" cy="92" r="40" fill="var(--color-coral)" />

      <path d="M0 197c68-4 104-22 162-23 45-1 74 8 119 7 61-1 84-24 148-24 61 0 82 19 143 18 60-1 93-13 148-16v35H0z" fill="#c5dfe0" opacity="0.75" />
      <path d="M0 218h720v102H0z" fill="url(#shore-sea)" />
      <path d="M0 226c44 7 74-4 118-1 51 4 77 17 133 14 62-3 92-16 151-12 56 4 85 15 142 12 68-4 111-12 176-8v89H0z" fill="#0e747c" opacity="0.55" />

      <g fill="none" strokeLinecap="round">
        <path d="M34 246c15-4 30-4 45 0 15 4 30 4 45 0" stroke="#fff" strokeWidth="3" opacity="0.55" />
        <path d="M248 238c13-3 26-3 39 0 13 3 26 3 39 0" stroke="#fff" strokeWidth="2.5" opacity="0.4" />
        <path d="M498 252c18-5 36-5 54 0 18 5 36 5 54 0" stroke="#fff" strokeWidth="3" opacity="0.5" />
        <path d="M118 272c11-3 22-3 33 0 11 3 22 3 33 0" stroke="#fff" strokeWidth="2" opacity="0.3" />
        <path d="M608 226c16-4 32-4 48 0 16 4 32 4 48 0" stroke="#fff" strokeWidth="2.5" opacity="0.35" />
      </g>

      {/* A small sail crossing the horizon. */}
      <g>
        <path d="M162 216l30-54h6l-4 54z" fill="#fffdf9" />
        <path d="M195 164l22 50h-20z" fill="#f1e9db" opacity="0.85" />
        <path d="M154 218h56l-9 10h-43z" fill="var(--color-navy)" />
        <path d="M136 232c15-2 30-2 45 0" stroke="#fff" strokeWidth="2" opacity="0.45" fill="none" strokeLinecap="round" />
      </g>

      <path d="M0 287c57-21 104-17 160-11 54 6 105 15 171 10 72-6 123-25 204-22 63 2 111 17 185 13v43H0z" fill="url(#shore-sand)" />
      <path d="M0 288c58-20 103-16 160-10 54 6 105 15 171 10 72-6 123-25 204-22 63 2 111 17 185 13" fill="none" stroke="#fffdf9" strokeWidth="4" opacity="0.72" strokeLinecap="round" />

      {/* Dune grass anchoring the near shore. */}
      <g fill="none" stroke="var(--color-ocean)" strokeLinecap="round" strokeWidth="3">
        <path d="M36 310c2-17 8-28 17-38" opacity="0.75" />
        <path d="M45 310c-1-12-5-22-12-30" opacity="0.5" />
        <path d="M54 312c5-12 12-21 22-27" opacity="0.65" />
        <path d="M64 312c0-9-3-16-8-22" opacity="0.45" />
        <path d="M668 306c-2-13-7-22-14-29" opacity="0.55" />
        <path d="M678 306c3-10 8-17 15-22" opacity="0.4" />
      </g>

      <g fill="none" stroke="var(--color-navy)" strokeLinecap="round" strokeWidth="2.5" opacity="0.55">
        <path d="M78 86c6-5 12-5 18 0" />
        <path d="M96 74c6-5 12-5 18 0" />
        <path d="M640 138c5-4 10-4 15 0" />
      </g>
    </svg>
  )
}

export function LighthouseArt() {
  return (
    <svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="light-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef4f3" />
          <stop offset="1" stopColor="var(--color-mist)" />
        </linearGradient>
        <linearGradient id="light-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2d8b91" />
          <stop offset="1" stopColor="var(--color-ocean)" />
        </linearGradient>
        <linearGradient id="light-beam" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#fff6d8" stopOpacity="0.8" />
          <stop offset="1" stopColor="#fff6d8" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="600" height="400" fill="url(#light-sky)" />
      <circle cx="130" cy="86" r="34" fill="var(--color-coral)" opacity="0.16" />
      <circle cx="130" cy="86" r="22" fill="var(--color-coral)" />

      <path d="M0 246c50-6 86-23 136-22 51 1 77 17 126 16 57-1 85-25 147-24 61 1 92 21 145 18 16-1 32-4 46-8v28H0z" fill="#b9d9da" opacity="0.7" />
      <path d="M0 263h600v137H0z" fill="url(#light-sea)" />
      <path d="M0 275c43 7 69-4 111-1 48 4 73 18 124 14 58-4 88-16 145-12 57 4 84 15 137 11 31-3 56-9 83-11v114H0z" fill="#0d757c" opacity="0.6" />

      {/* The beam and lighthouse sit on the raised headland at the right. */}
      <path d="M324 124L492 82l18 12-174 68z" fill="url(#light-beam)" />
      <path d="M324 150l174-32 12 15-177 47z" fill="url(#light-beam)" opacity="0.55" />

      {/* The headland rises to a rock shelf directly under the tower, so the lighthouse has solid ground. */}
      <g>
        <path d="M330 400c14-38 36-72 60-102 14-18 26-36 34-56l8-28 32-6 30 2 28 6 8 24c20 22 46 45 70 66v94z" fill="#586d75" />
        <path d="M368 400c16-38 38-74 62-104 14-18 25-36 32-55l4-17-18 4-9 24c-8 20-21 39-35 57-22 29-42 59-54 91z" fill="#3f555f" />
        <path d="M432 214l32-6 30 2 28 6" fill="none" stroke="#8aa0a2" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
      </g>

      <g>
        <path d="M445 216l10-116h42l11 116z" fill="#fffdf9" />
        <path d="M449 180h54l2 20h-57z" fill="var(--color-coral)" />
        <path d="M442 152h68l3 24h-73z" fill="var(--color-coral)" />
        <path d="M452 116h48l-4-18h-40z" fill="#fffdf9" />
        <path d="M449 92h54v8h-54z" fill="var(--color-navy)" />
        <path d="M456 78h40l-7-13h-26z" fill="var(--color-navy)" />
        <path d="M476 65v-10" stroke="var(--color-navy)" strokeWidth="3" strokeLinecap="round" />
        <path d="M448 96h56" stroke="var(--color-navy)" strokeWidth="2.5" strokeLinecap="round" opacity="0.75" />
        <rect x="464" y="57" width="24" height="14" rx="2" fill="#ffe9a9" />
        <rect x="470" y="196" width="14" height="20" rx="7" fill="var(--color-navy)" opacity="0.8" />
        <path d="M440 100h72" stroke="var(--color-navy)" strokeWidth="2" opacity="0.25" />
        <path d="M436 220h82" stroke="var(--color-navy)" strokeWidth="5" strokeLinecap="round" opacity="0.3" />
      </g>

      {/* Surf breaks against the seaward edge of the headland. */}
      <g fill="none" stroke="#fffdf9" strokeLinecap="round" opacity="0.55">
        <path d="M250 326c16-5 32-5 48 0 16 5 32 5 48 0" strokeWidth="3" />
        <path d="M266 346c13-4 26-4 39 0 13 4 26 4 39 0" strokeWidth="2.5" />
      </g>

      <g fill="none" stroke="#fffdf9" strokeLinecap="round" strokeWidth="3" opacity="0.55">
        <path d="M44 301c17-4 34-4 51 0 17 4 34 4 51 0" />
        <path d="M202 321c13-3 26-3 39 0 13 3 26 3 39 0" />
        <path d="M78 340c11-3 22-3 33 0 11 3 22 3 33 0" />
      </g>

      <g fill="none" stroke="var(--color-navy)" strokeLinecap="round" strokeWidth="2.5" opacity="0.55">
        <path d="M100 140c6-5 12-5 18 0" />
        <path d="M126 126c6-5 12-5 18 0" />
        <path d="M208 174c5-4 10-4 15 0" />
      </g>

      {/* Grass on the dark headland keeps the foreground from feeling flat. */}
      <g fill="none" stroke="var(--color-mist)" strokeLinecap="round" strokeWidth="2.5" opacity="0.55">
        <path d="M384 386c2-12 6-20 13-27" />
        <path d="M398 388c4-9 10-16 18-20" />
        <path d="M556 380c-1-9-4-16-9-22" />
      </g>
    </svg>
  )
}

// A quiet missing-photo panel for the Discover card: a soft coastal wash, one
// faint wave line and plain initials. It stays deliberately plainer than a photo.
// Gradient ids are unique per mounted card; two stacked cards must not share defs.
export function CoastalPortraitArt({ initials }: { initials: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const wash = `portrait-wash-${uid}`

  return (
    <svg
      className="coastal-portrait"
      viewBox="0 0 640 480"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={wash} x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0" stopColor="#eef4f2" />
          <stop offset="0.55" stopColor="#f4f0e7" />
          <stop offset="1" stopColor="#e9e3d6" />
        </linearGradient>
      </defs>

      <rect width="640" height="480" fill={`url(#${wash})`} />

      {/* One faint contour carries the coast without becoming a competing scene. */}
      <path
        d="M-24 312c82-21 142-26 216-16 75 10 121 18 192 10 86-9 145-31 280-14v96c-128-13-198 7-282 14-72 6-117-6-190-14-83-9-142-2-216 20z"
        fill="none"
        stroke="var(--color-ocean-line)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.72"
      />

      <text
        x="320"
        y="240"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--color-navy)"
        fontFamily="var(--font-body)"
        fontSize="56"
        fontWeight="650"
        letterSpacing="4"
      >
        {initials}
      </text>
    </svg>
  )
}
