import rules from '../../spec/initial/data/romaji_rules_v1.json';

type Edge = { destination: number; spelling: string };
type Candidate = { destination: number; remaining: string };
const table: Record<string, string[]> = { ...rules.tables.basic, ...rules.tables.yoon, ...rules.tables.foreign };
const entries = Object.entries(table);
const compareGuide = (a: string, b: string) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

/** A reading-position DAG, retaining all valid spellings and ambiguous prefixes. */
export class RomajiEngine {
  readonly canonicalLength: number;
  private readonly graph: Edge[][];
  private readonly suffixes: string[];
  private candidates: Candidate[] = [{ destination: 0, remaining: '' }];
  acceptedInput = '';

  constructor(readonly reading: string) {
    this.graph = Array.from({ length: reading.length + 1 }, () => []);
    for (let position = reading.length - 1; position >= 0; position--) {
      const edges: Edge[] = [];
      for (const [kana, spellings] of entries) {
        if (reading.startsWith(kana, position)) {
          for (const spelling of spellings) edges.push({ destination: position + kana.length, spelling });
        }
      }
      if (reading[position] === rules.nasal.kana) {
        for (const spelling of rules.nasal.always) edges.push({ destination: position + 1, spelling });
        for (const next of this.graph[position + 1]) {
          if (!rules.nasal.blockedNextInitials.includes(next.spelling[0])) {
            edges.push({ destination: next.destination, spelling: rules.nasal.contextPrefix + next.spelling });
          }
        }
      }
      if (reading[position] === rules.sokuon.kana) {
        for (const next of this.graph[position + 1]) {
          if (!rules.sokuon.blockedNextInitials.includes(next.spelling[0])) {
            edges.push({ destination: next.destination, spelling: next.spelling[0] + next.spelling });
          }
          if (rules.sokuon.tPrefixBefore.some((prefix) => next.spelling.startsWith(prefix))) {
            edges.push({ destination: next.destination, spelling: rules.sokuon.tPrefix + next.spelling });
          }
        }
      }
      this.graph[position] = edges;
    }
    this.suffixes = Array(reading.length + 1).fill('');
    const reachable = Array(reading.length + 1).fill(false) as boolean[];
    reachable[reading.length] = true;
    for (let position = reading.length - 1; position >= 0; position--) {
      const choices = this.graph[position]
        .filter((edge) => reachable[edge.destination])
        .map((edge) => edge.spelling + this.suffixes[edge.destination]).sort(compareGuide);
      if (choices.length) {
        reachable[position] = true;
        this.suffixes[position] = choices[0];
      }
    }
    if (!reachable[0] || !reading.length) throw new Error(`Unsupported reading: ${reading}`);
    this.canonicalLength = this.suffixes[0].length;
  }

  get complete(): boolean {
    return this.candidates.some((candidate) => candidate.destination === this.reading.length && !candidate.remaining);
  }

  get remainingGuide(): string {
    return this.candidates.map((candidate) => candidate.remaining + this.suffixes[candidate.destination]).sort(compareGuide)[0];
  }

  get guide(): string { return this.acceptedInput + this.remainingGuide; }

  input(raw: string): { accepted: boolean; completed: boolean } {
    if (!/^[A-Za-z'-]$/.test(raw) || this.complete) return { accepted: false, completed: this.complete };
    const key = raw.toLowerCase();
    const next = new Map<string, Candidate>();
    for (const candidate of this.candidates) {
      const choices = candidate.remaining ? [candidate] : this.graph[candidate.destination].map((edge) => ({ destination: edge.destination, remaining: edge.spelling }));
      for (const choice of choices) {
        if (choice.remaining[0] === key) {
          const advanced = { destination: choice.destination, remaining: choice.remaining.slice(1) };
          next.set(`${advanced.destination}:${advanced.remaining}`, advanced);
        }
      }
    }
    if (!next.size) return { accepted: false, completed: false };
    this.candidates = [...next.values()];
    this.acceptedInput += key;
    return { accepted: true, completed: this.complete };
  }
}
