import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const description = "A focused network where startup founders and investors discover one another, connect and discuss opportunities.";
  return {
    metadataBase,
    title: { default: "BYLLD X — Where Ambition Meets Backing", template: "%s · BYLLD X" },
    description,
    applicationName: "BYLLD X",
    robots: { index: true, follow: true },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "BYLLD X — Where Ambition Meets Backing", description, type: "website", images: [{ url: new URL("/og.png", metadataBase), width: 1728, height: 910, alt: "BYLLD X — Where Ambition Meets Backing" }] },
    twitter: { card: "summary_large_image", title: "BYLLD X — Where Ambition Meets Backing", description, images: [new URL("/og.png", metadataBase)] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
