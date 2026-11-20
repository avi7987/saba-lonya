import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/sections/Footer";
import QuestionsView from "@/components/quiz/QuestionsView";

export const metadata: Metadata = { title: "השאלות של סבא · סבא לוניה" };

/** all of grandma's questions in one place, for whoever would rather choose one */
export default function QuestionsPage() {
  return (
    <>
      <Header />
      <QuestionsView />
      <Footer />
    </>
  );
}
