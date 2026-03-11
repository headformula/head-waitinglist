import type { Metadata } from "next";
import "./globals.css";
import { ThemeProviderWrapper } from "./theme-wrapper";

export const metadata: Metadata = {
  title: "HeadFormula | Software House",
  description:
    "Trasformiamo le tue idee in software di qualità. Sviluppo web, app mobile e soluzioni SaaS su misura.",
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
