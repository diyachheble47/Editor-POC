// Schematic symbols for the circuit block. Each is drawn in a 96x48 box with
// its leads on y=24, so every part connects left-to-right through the same
// handle positions used by CircuitNode.

export const PART_TYPES = [
  'battery',
  'acsource',
  'resistor',
  'capacitor',
  'inductor',
  'diode',
  'led',
  'bulb',
  'switch',
  'fuse',
  'ammeter',
  'voltmeter',
  'ground',
  'wire',
] as const
export type PartType = (typeof PART_TYPES)[number]

export const PART_LABELS: Record<PartType, string> = {
  battery: 'Battery',
  acsource: 'AC source',
  resistor: 'Resistor',
  capacitor: 'Capacitor',
  inductor: 'Inductor',
  diode: 'Diode',
  led: 'LED',
  bulb: 'Bulb',
  switch: 'Switch',
  fuse: 'Fuse',
  ammeter: 'Ammeter',
  voltmeter: 'Voltmeter',
  ground: 'Ground',
  wire: 'Wire',
}

export function defaultValue(type: PartType): string {
  switch (type) {
    case 'battery': return '9 V'
    case 'acsource': return '12 V AC'
    case 'resistor': return '100 Ω'
    case 'capacitor': return '10 µF'
    case 'inductor': return '10 mH'
    case 'diode': return 'Diode'
    case 'led': return 'LED'
    case 'bulb': return 'Bulb'
    case 'switch': return 'Open'
    case 'fuse': return '1 A'
    case 'ammeter': return 'A'
    case 'voltmeter': return 'V'
    case 'ground': return ''
    case 'wire': return ''
  }
}

const STROKE = 'currentColor'

function Leads({ from, to }: { from: number; to: number }) {
  return (
    <>
      <line x1="0" y1="24" x2={from} y2="24" />
      <line x1={to} y1="24" x2="96" y2="24" />
    </>
  )
}

function MeterSymbol({ letter }: { letter: string }) {
  return (
    <>
      <Leads from={30} to={66} />
      <circle cx="48" cy="24" r="18" />
      <text x="48" y="30" textAnchor="middle" fontSize="18" fontWeight="600" fill={STROKE} stroke="none">
        {letter}
      </text>
    </>
  )
}

export function PartSymbol({ type, closed }: { type: PartType; closed: boolean }) {
  return (
    <svg width="96" height="48" viewBox="0 0 96 48" className="circuit-symbol" aria-hidden="true">
      <g stroke={STROKE} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {type === 'wire' && <line x1="0" y1="24" x2="96" y2="24" />}
        {type === 'battery' && (
          <>
            <Leads from={42} to={66} />
            <line x1="42" y1="10" x2="42" y2="38" strokeWidth="3" />
            <line x1="50" y1="17" x2="50" y2="31" />
            <line x1="58" y1="10" x2="58" y2="38" strokeWidth="3" />
            <line x1="66" y1="17" x2="66" y2="31" />
          </>
        )}
        {type === 'acsource' && (
          <>
            <Leads from={30} to={66} />
            <circle cx="48" cy="24" r="18" />
            <path d="M38 24 C42 14, 46 14, 48 24 S54 34, 58 24" />
          </>
        )}
        {type === 'resistor' && (
          <>
            <Leads from={24} to={72} />
            <rect x="24" y="16" width="48" height="16" />
          </>
        )}
        {type === 'capacitor' && (
          <>
            <Leads from={42} to={54} />
            <line x1="42" y1="10" x2="42" y2="38" strokeWidth="3" />
            <line x1="54" y1="10" x2="54" y2="38" strokeWidth="3" />
          </>
        )}
        {type === 'inductor' && (
          <>
            <Leads from={16} to={80} />
            <path d="M16 24 a8 8 0 0 1 16 0 a8 8 0 0 1 16 0 a8 8 0 0 1 16 0 a8 8 0 0 1 16 0" />
          </>
        )}
        {type === 'diode' && (
          <>
            <Leads from={34} to={58} />
            <polygon points="34,12 34,36 58,24" />
            <line x1="58" y1="12" x2="58" y2="36" strokeWidth="3" />
          </>
        )}
        {type === 'led' && (
          <>
            <Leads from={32} to={56} />
            <polygon points="32,14 32,34 54,24" fill={STROKE} />
            <line x1="56" y1="14" x2="56" y2="34" />
            <line x1="60" y1="12" x2="68" y2="4" />
            <line x1="64" y1="18" x2="72" y2="10" />
          </>
        )}
        {type === 'bulb' && (
          <>
            <Leads from={30} to={66} />
            <circle cx="48" cy="24" r="18" />
            <line x1="35" y1="11" x2="61" y2="37" />
            <line x1="61" y1="11" x2="35" y2="37" />
          </>
        )}
        {type === 'switch' && (
          <>
            <Leads from={30} to={66} />
            <circle cx="30" cy="24" r="2" fill={STROKE} />
            <line x1="30" y1="24" x2={closed ? 66 : 62} y2={closed ? 24 : 14} />
            <circle cx="66" cy="24" r="2" fill={STROKE} />
          </>
        )}
        {type === 'fuse' && (
          <>
            <Leads from={24} to={72} />
            <rect x="24" y="17" width="48" height="14" rx="2" />
            <path d="M24 24 C34 14, 38 34, 48 24 S62 14, 72 24" />
          </>
        )}
        {type === 'ammeter' && <MeterSymbol letter="A" />}
        {type === 'voltmeter' && <MeterSymbol letter="V" />}
        {type === 'ground' && (
          <>
            <line x1="48" y1="0" x2="48" y2="20" />
            <line x1="30" y1="20" x2="66" y2="20" />
            <line x1="36" y1="27" x2="60" y2="27" />
            <line x1="42" y1="34" x2="54" y2="34" />
          </>
        )}
      </g>
    </svg>
  )
}
