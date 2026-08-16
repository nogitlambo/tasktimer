import { redirect } from "next/navigation";

export default function BrainDumpPage() {
  redirect("/executive?view=brain-dump");
}
