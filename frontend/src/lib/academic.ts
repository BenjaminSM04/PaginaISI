export const SEMESTERS = Object.freeze(Array.from({ length: 8 }, (_, index) => index + 1));

export function isValidSemester(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 8;
}
