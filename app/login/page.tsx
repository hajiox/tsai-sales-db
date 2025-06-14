import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import LoginButton from "./LoginButton";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/sales/dashboard");
  }

  return (
    <div className="flex min-h-screen items-start justify-center pt-20 bg-gray-100">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-8 shadow">
        <h1 className="mb-2 text-center text-2xl font-bold">TSAログイン画面</h1>
        <p className="mb-6 text-center text-sm text-gray-500">Technical Staff AI System</p>
        <p className="mb-4 text-center">Googleアカウントでログインしてください</p>
        <div className="flex justify-center">
          <LoginButton />
        </div>
      </div>
    </div>
  );
}
