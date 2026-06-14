import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mantis — Assistant for Your Products",
  description: "An intelligent diagnostic assistant for the products you own.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <a href="/" className="brand">
            <span className="brand-mark">🦗</span> MANTIS
          </a>
          <span className="tagline">Assistant for Your Products</span>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
