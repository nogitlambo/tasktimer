import type { Metadata } from "next";
import HomePageClient from "./HomePageClient";

export const metadata: Metadata = {
  title: "Task Tracking Made Easy",
  description: "Track tasks, focus sessions, progress history, and productivity with TaskLaunch.",
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  return <HomePageClient />;
}
