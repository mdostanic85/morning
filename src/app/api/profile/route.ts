import { NextResponse } from "next/server";
import { getUserProfile, saveUserProfile } from "@/services/userProfile";

export async function GET() {
  const profile = await getUserProfile();
  return NextResponse.json({ profile });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; name?: string };
  if (typeof body.email !== "string") {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  try {
    const profile = await saveUserProfile(body.email, body.name);
    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save profile.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
