export const MAX_REVIEW_ITERATIONS = 3;

export function isCriticApproval(feedback: string, hasErrors: boolean): boolean {
  return !hasErrors && feedback.trim().toUpperCase() === 'APPROVED';
}

export function shouldContinueReview(feedback: string, hasErrors: boolean, iterations: number): boolean {
  return !isCriticApproval(feedback, hasErrors) && iterations < MAX_REVIEW_ITERATIONS;
}
