import { headers } from "next/headers";
import { notFound } from "next/navigation";
import PrimitiveGallery from "./PrimitiveGallery";
import { shouldShowPrimitiveGallery } from "./devGate";
import "../tasktimer/tasktimer.css";
import "./primitives.css";

export const dynamic = "force-dynamic";

export default async function PrimitivesPage() {
  const requestHeaders = await headers();

  if (!shouldShowPrimitiveGallery({ host: requestHeaders.get("host") })) {
    notFound();
  }

  return <PrimitiveGallery />;
}
