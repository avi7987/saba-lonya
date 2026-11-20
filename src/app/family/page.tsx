import type { Metadata } from "next";
import Header from "@/components/Header";
import { LightboxProvider } from "@/components/Lightbox";
import FamilyTree from "@/components/family/FamilyTree";
import Footer from "@/components/sections/Footer";

export const metadata: Metadata = { title: "המשפחה · סבא לוניה" };

/** The family tree on a page of its own, with room for the whole map. */
export default function FamilyPage() {
  return (
    <LightboxProvider>
      <Header />
      <main id="content" className="pt-[4.5rem]">
        <h1 className="sr-only">המשפחה של סבא לוניה · Семья дедушки Лёни</h1>
        <FamilyTree />
      </main>
      <Footer />
    </LightboxProvider>
  );
}
