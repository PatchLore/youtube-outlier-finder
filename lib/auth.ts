/**
 * Admin override system for Pro access
 * Admins get full Pro features without payment
 * Paid users get Pro access via Stripe subscription (stored in Clerk publicMetadata)
 */

// Add your admin email(s) here
const ADMIN_EMAILS = [
  "atmospherix8@gmail.com",
];

export type UserPlan = "free" | "admin" | "pro";

/**
 * Determines user plan based on Clerk metadata and email
 * Priority:
 * 1. Check Clerk publicMetadata.plan (set by Stripe webhook)
 * 2. Check if email is in ADMIN_EMAILS (admin override)
 * 3. Default to "free"
 * 
 * @param email - User's email address from Clerk
 * @param publicMetadata - User's publicMetadata from Clerk (contains plan if paid)
 * @returns "pro" if paid, "admin" if admin email, otherwise "free"
 */
export function getUserPlan(
  email: string | null | undefined,
  publicMetadata?: Record<string, unknown> | null
): UserPlan {
  // First, check if user has Pro plan from Stripe subscription (in publicMetadata)
  if (publicMetadata?.plan === "pro") {
    return "pro";
  }

  // Then, check if user is an admin (email-based override)
  if (email) {
    const normalizedEmail = email.toLowerCase().trim();
    if (ADMIN_EMAILS.some(
      (adminEmail) => adminEmail.toLowerCase().trim() === normalizedEmail
    )) {
      return "admin";
    }
  }

  // Default to free
  return "free";
}

/**
 * Checks if user has Pro access
 * Both admin users and paid Pro users count as Pro
 * @param plan - User's plan from getUserPlan()
 * @returns true if user has Pro access (admin or paid)
 */
export function isPro(plan: UserPlan): boolean {
  return plan === "admin" || plan === "pro";
}
