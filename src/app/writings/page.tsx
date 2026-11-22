import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/sections/Footer";
import WritingsView from "@/components/memories/WritingsView";

export const metadata: Metadata = { title: "השירים והמכתבים · סבא לוניה" };

/** his poems, letters and greetings, as a book */
export default function WritingsPage() {
  return (
    <>
      <Header />
      <WritingsView />
      <Footer />
    </>
  );
}
