import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignInPage } from "@/components/auth/SignInPage";

export default async function SignInRoutePage() {
  const { userId } = await auth();
  if (userId) redirect("/");

  return <SignInPage />;
}
