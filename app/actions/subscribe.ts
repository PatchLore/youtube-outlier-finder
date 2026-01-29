"use server";

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function subscribeToWaitlist(formData: FormData) {
  const email = formData.get("email") as string;
  if (!email || !email.includes("@")) {
    return { error: "Please enter a valid email address." };
  }
  try {
    await resend.emails.send({
      from: "Outlier <onboarding@resend.dev>",
      to: email,
      subject: "You're on the list! 🚀",
      html: "<h1>Welcome to the Outlier Waitlist</h1><p>Thanks for joining!</p>",
    });
    return { success: true };
  } catch {
    return { error: "Something went wrong." };
  }
}
