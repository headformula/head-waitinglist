import type { Metadata } from "next";
import "./globals.css";
import { ThemeProviderWrapper } from "./theme-wrapper";

export const metadata: Metadata = {
  title: "headformula - products, not promises.",
  description:
    "We're building apps that reshape what software can do. Join the waitlist for early access and a chance to win 1 SOL.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "headformula - products, not promises.",
    description:
      "We're building apps that reshape what software can do. Join the waitlist for early access and a chance to win 1 SOL.",
    url: "https://headformula.studio",
    siteName: "headformula",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "headformula - products, not promises.",
    description:
      "We're building apps that reshape what software can do. Join the waitlist for early access and a chance to win 1 SOL.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="antialiased m-0 p-0">
        <ThemeProviderWrapper>{children}</ThemeProviderWrapper>
      </body>
    </html>
  );
}
