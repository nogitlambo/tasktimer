import { NextResponse } from "next/server";

import { unsubscribeEarlyAccessEmail } from "@/lib/earlyAccessUnsubscribe";

export const dynamic = "force-dynamic";

function asString(value: string | null) {
  return String(value || "").trim();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const result = await unsubscribeEarlyAccessEmail({
      email: asString(url.searchParams.get("email")),
      token: asString(url.searchParams.get("token")),
    });
    const statusCode = result.status === "invalid" ? 400 : 200;
    return NextResponse.json(result, { status: statusCode });
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 500 });
  }
}
