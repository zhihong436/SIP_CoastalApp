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

// A layered coast for the Discover card. The medallion sits on the sandbar so the
// initials belong to the scene instead of standing in for a missing photo.
// Gradient ids are unique per mounted card; two stacked cards must not share defs.
export function CoastalPortraitArt({ initials }: { initials: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const sky = `portrait-sky-${uid}`
  const sun = `portrait-sun-${uid}`
  const sea = `portrait-sea-${uid}`
  const sand = `portrait-sand-${uid}`
  const skyClip = `portrait-sky-clip-${uid}`

  return (
    <svg
      className="coastal-portrait"
      viewBox="0 0 640 760"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0.22" y2="1">
          <stop offset="0" stopColor="#e7f1f0" />
          <stop offset="0.58" stopColor="#eff1e9" />
          <stop offset="1" stopColor="#f6e9d6" />
        </linearGradient>
        <linearGradient id={sun} x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#e08a74" />
          <stop offset="0.55" stopColor="#cf5b61" />
          <stop offset="1" stopColor="#b52f4b" />
        </linearGradient>
        <linearGradient id={sea} x1="0" y1="0" x2="0.18" y2="1">
          <stop offset="0" stopColor="#9acac9" />
          <stop offset="0.24" stopColor="#4b9fa3" />
          <stop offset="0.56" stopColor="#17777f" />
          <stop offset="0.82" stopColor="#0a5560" />
          <stop offset="1" stopColor="#142a35" />
        </linearGradient>
        <linearGradient id={sand} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#f8efdf" />
          <stop offset="0.55" stopColor="#efe0c5" />
          <stop offset="1" stopColor="#e2cda4" />
        </linearGradient>
        <clipPath id={skyClip}>
          <rect width="640" height="338" />
        </clipPath>
      </defs>

      {/* The sun stays above the horizon; the clip keeps the halo from spilling into the sea. */}
      <rect width="640" height="342" fill={`url(#${sky})`} />
      <g clipPath={`url(#${skyClip})`}>
        <circle cx="476" cy="230" r="108" fill="var(--color-coral)" opacity="0.1" />
        <circle cx="476" cy="230" r="88" fill="#f2c6a4" opacity="0.16" />
        <circle cx="476" cy="230" r="60" fill={`url(#${sun})`} />
      </g>

      {/* A thin bank of haze keeps the horizon from reading as a hard edge. */}
      <path
        d="M0 306c54-5 92-18 144-19 51-1 85 12 134 10 60-2 92-18 151-19 57-1 94 12 151 13 24 0 46-3 60-5v32H0z"
        fill="#f7f1e5"
        opacity="0.55"
      />
      <path
        d="M0 318c46-7 82-24 131-25 43-1 72 10 115 8 57-3 91-20 149-21 55-1 91 13 145 14 36 1 70-5 100-9v42H0z"
        fill="#c7dedb"
        opacity="0.85"
      />
      <path
        d="M0 330c59-3 99 8 154 7 56-1 92-15 147-16 54-1 91 12 144 13 60 1 121-4 195-2v29H0z"
        fill="#9ec9c8"
        opacity="0.55"
      />

      <path d="M0 338h640v422H0z" fill={`url(#${sea})`} />
      <rect y="338" width="640" height="9" fill="#d9ece8" opacity="0.35" />
      <ellipse cx="476" cy="352" rx="98" ry="15" fill="#f1c09d" opacity="0.38" />

      {/* Layered swells give the water depth without a hard banding effect. */}
      <path
        d="M0 390c72-12 130-12 204 0 68 11 128 11 200 0 76-12 142-12 236 0v44H0z"
        fill="#0b6770"
        opacity="0.26"
      />
      <path
        d="M0 446c84 16 146 16 230 0 78-15 140-15 218 0 66 13 126 13 192 0v76H0z"
        fill="#0a5963"
        opacity="0.34"
      />

      {/* The sandbar crosses the frame, carrying the initials near the centre of every crop. */}
      <path
        d="M0 400c66-25 121-36 193-33 70 3 130 22 198 26 80 5 162-9 249-30v88c-92 25-182 35-272 28-88-7-154-25-226-20-50 4-96 16-142 27z"
        fill={`url(#${sand})`}
      />
      <path
        d="M0 400c66-25 121-36 193-33 70 3 130 22 198 26 80 5 162-9 249-30"
        fill="none"
        stroke="#fffdf9"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.8"
      />

      <g transform="translate(166 388)">
        <ellipse cx="0" cy="66" rx="76" ry="14" fill="#0a4a54" opacity="0.22" />
        <circle r="76" fill="#0b6770" opacity="0.14" />
        <circle r="62" fill="#fffdf9" />
        <circle r="62" fill="none" stroke="#0b6770" strokeWidth="1.5" opacity="0.4" />
        <circle r="53" fill="none" stroke="var(--color-coral)" strokeWidth="1.5" opacity="0.42" strokeDasharray="2 6" />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          y="2"
          fill="var(--color-navy)"
          fontSize="34"
          fontWeight="700"
          letterSpacing="3"
        >
          {initials}
        </text>
      </g>

      {/* The foreground water carries the eye down into the navy identity base. */}
      <path
        d="M0 500c90 22 156 24 246 12 95-12 166-4 244 6 58 8 104 6 150-2v244H0z"
        fill="#0a5560"
        opacity="0.78"
      />
      <path
        d="M0 590c74 18 142 20 222 10 92-11 164-4 244 8 62 9 116 8 174 0v152H0z"
        fill="#0d3f49"
      />
      <path d="M0 680c94 16 174 14 268 4 100-10 178-4 262 8 40 6 74 6 110 2v66H0z" fill="#142a35" />

      <g fill="none" stroke="#fffdf9" strokeLinecap="round" opacity="0.5">
        <path d="M64 504c20-6 40-6 60 0 20 6 40 6 60 0" strokeWidth="3" />
        <path d="M300 520c16-5 32-5 48 0 16 5 32 5 48 0" strokeWidth="2.5" />
        <path d="M452 548c20-6 40-6 60 0 20 6 40 6 60 0" strokeWidth="3" />
        <path d="M118 602c14-4 28-4 42 0 14 4 28 4 42 0" strokeWidth="2.5" opacity="0.72" />
        <path d="M420 642c17-5 34-5 51 0 17 5 34 5 51 0" strokeWidth="2.5" opacity="0.6" />
        <path d="M196 704c18-5 36-5 54 0 18 5 36 5 54 0" strokeWidth="3" opacity="0.55" />
      </g>

      {/* Dune grass and a few birds anchor the near shore. */}
      <g fill="none" stroke="#0b6770" strokeLinecap="round" strokeWidth="3" opacity="0.6">
        <path d="M42 438c2-15 7-25 15-34" />
        <path d="M51 440c-1-11-5-20-11-27" />
        <path d="M60 442c5-11 12-19 21-25" />
      </g>
      <g fill="none" stroke="var(--color-navy)" strokeLinecap="round" strokeWidth="2.5" opacity="0.5">
        <path d="M82 94c6-5 12-5 18 0" />
        <path d="M104 80c6-5 12-5 18 0" />
        <path d="M560 208c5-4 10-4 15 0" />
      </g>
    </svg>
  )
}
