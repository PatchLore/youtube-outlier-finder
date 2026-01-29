"use server";

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Outlier <updates@outlieryt.com>";

export async function subscribeToWaitlist(formData: FormData) {
  const email = formData.get("email") as string;
  if (!email || !email.includes("@")) {
    return { error: "Please enter a valid email address." };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { error: "Email service is not configured. Please try again later." };
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "You're on the list! 🚀",
      html: "<h1>Welcome to the Outlier Waitlist</h1><p>Thanks for joining!</p>",
    });
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return { error: message };
  }
}
