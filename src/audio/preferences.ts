export interface AudioVolume { master: number; effects: number; music: number }
export const defaultAudioVolume: Readonly<AudioVolume> = Object.freeze({ master: 0.5, effects: 0.7, music: 0.25 });
/** An omitted value means the player has not selected different channel levels. */
export const selectedAudioVolume = (value?: AudioVolume): AudioVolume => ({ ...(value ?? defaultAudioVolume) });

/** Persisted/imported settings boundary; internal playback does not revalidate the document. */
export function validAudioVolume(value: unknown): value is AudioVolume {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 3 && ['master', 'effects', 'music'].every(key =>
    typeof record[key] === 'number' && Number.isFinite(record[key]) && record[key] >= 0 && record[key] <= 1);
}
