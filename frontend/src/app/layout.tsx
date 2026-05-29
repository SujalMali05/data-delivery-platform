import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Data Delivery Platform — Internal Transfer Management",
  description:
    "Securely transfer large-scale data from Google Drive to Customer AWS S3 via rclone and AssumeRole",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem('ddp_theme') || 'dark';
                document.documentElement.setAttribute('data-theme', theme);
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
