/**
 * User plan system
 * Pro access is granted via Stripe subscription and stored in Clerk publicMetadata.plan
 */

export type UserPlan = "free" | "pro";

/**
 * Determines user plan based on Clerk publicMetadata
 * Pro access is set by Stripe webhook when subscription is created
 * 
 * @param planValue - The plan value from user.publicMetadata.plan (string or undefined)
 * @returns "pro" if planValue === "pro", otherwise "free"
 */
export function getUserPlan(
  planValue?: string | null
): UserPlan {
  if (planValue === "pro") {
    return "pro";
  }
  return "free";
}

/**
 * Checks if user has Pro access
 * @param plan - User's plan from getUserPlan()
 * @returns true if user has Pro access
 */
export function isPro(plan: UserPlan): boolean {
  return plan === "pro";
}
