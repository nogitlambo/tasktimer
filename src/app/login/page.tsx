import { Suspense } from "react";
import LoginPageClient from "./LoginPageClient";

export default function WebSignInPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageClient />
    </Suspense>
  );
}
