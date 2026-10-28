import { ApiError } from './api';

/** Transport already exhausted its retries; do not multiply them in React Query. */
export function retryQuery(failureCount: number, error: unknown) {
  if (
    error instanceof ApiError &&
    (error.status === 0 || (error.status >= 400 && error.status < 500))
  )
    return false;
  return failureCount < 1;
}
