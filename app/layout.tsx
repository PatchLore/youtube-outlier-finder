import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClientProviders } from "./components/ClientProviders";
import { AuthButton } from "./components/AuthButton";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YouTube Outlier Finder – Find Breakout Video Ideas Early",
  description: "Discover YouTube videos that are outperforming expectations before they go mainstream.",
  openGraph: {
    title: "YouTube Outlier Finder – Find Breakout Video Ideas Early",
    description: "Discover YouTube videos that are outperforming expectations before they go mainstream.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "YouTube Outlier Finder – Find Breakout Video Ideas Early",
    description: "Discover YouTube videos that are outperforming expectations before they go mainstream.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClientProviders>
          <AuthButton />
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
