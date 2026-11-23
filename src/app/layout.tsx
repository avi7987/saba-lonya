import type { Metadata, Viewport } from "next";
import Shell from "@/components/Shell";
// the fonts ship with the site instead of being fetched from Google at build time
// one family for Hebrew, Russian and Latin: Rubik, variable 300-900 (only the subsets a page uses are downloaded)
import "@fontsource-variable/rubik/wght.css";
import "@fontsource/playpen-sans-hebrew/hebrew-300.css";
import "@fontsource/playpen-sans-hebrew/hebrew-400.css";
import "@fontsource/caveat/400.css";
import "@fontsource/caveat/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "סבא לוניה · Дедушка Лёня",
  description: "מקום אחד לכל מה שאנחנו זוכרים מסבא לוניה",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#f5f0e6", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
