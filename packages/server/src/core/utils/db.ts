import { QueryFailedError } from 'typeorm';

/**
 * Determine if the error is a foreign key constraint error (Postgres + MySQL common)
 */
export function isForeignKeyConstraintError(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;

  const code = (error as any).driverError?.code;

  // Postgres: 23503, MySQL: 1451, 1452
  return code === '23503' || code === '1451' || code === '1452';
}
