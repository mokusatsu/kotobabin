export type CourseId = 'relaxed' | 'standard' | 'challenge';
export type DifficultyBand = 'easy' | 'medium' | 'hard';
export type SessionMode = 'MAIN' | 'PRACTICE' | 'TUTORIAL';
export interface Word {
  id: string;
  display: string;
  reading: string;
  courseId: CourseId;
  topicId: string;
  difficultyBand: DifficultyBand;
  canonicalLength: number;
  tags: string[];
}
