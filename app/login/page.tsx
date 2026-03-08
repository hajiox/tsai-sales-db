import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import LoginButton from "./LoginButton";
import MobileDetectWrapper from "./MobileDetectWrapper";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    const headersList = await headers();
    const ua = headersList.get("user-agent") || "";
    const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    redirect(isMobile ? "/mobile" : "/sales/dashboard");
  }

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      background: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
    }}>
      <MobileDetectWrapper>
        <div style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 20,
          background: "#fff",
          padding: "40px 28px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}>
          {/* Logo / Icon */}
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: "linear-gradient(135deg, #1e293b, #334155)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            fontSize: 28,
          }}>
            📊
          </div>

          <h1 style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#1e293b",
            marginBottom: 6,
            letterSpacing: -0.5,
          }}>
            TSA System
          </h1>
          <p style={{
            fontSize: 13,
            color: "#94a3b8",
            marginBottom: 32,
          }}>
            Technical Staff AI System
          </p>

          <p style={{
            fontSize: 14,
            color: "#64748b",
            marginBottom: 20,
          }}>
            Googleアカウントでログインしてください
          </p>

          <div style={{
            display: "flex",
            justifyContent: "center",
          }}>
            <LoginButton />
          </div>

          <div style={{
            marginTop: 32,
            fontSize: 11,
            color: "#cbd5e1",
          }}>
            © 2026 会津ブランド館
          </div>
        </div>
      </MobileDetectWrapper>
    </div>
  );
}

