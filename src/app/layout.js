import "./globals.css";

export const metadata = {
  title: "TableTap",
  description: "Scan. Order. Done.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}