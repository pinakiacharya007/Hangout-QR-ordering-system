"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const restaurantId = params.get("restaurantId") || "demo-restaurant";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }
      router.push(`/admin/${restaurantId}`);
      router.refresh();
    } catch (err) {
      setError("Couldn't reach the server — check your connection.");
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: "0 auto", padding: "80px 24px" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div className="admin-logo-holder" style={{ width: 56, height: 56, margin: "0 auto 12px" }}>
          <img
            src="/logo.png"
            alt=""
            onError={(e) => {
              e.target.style.display = "none";
              e.target.nextSibling.style.display = "flex";
            }}
          />
          <span className="admin-logo-fallback">H</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--navy-900)" }}>Hangout Restro Cafe</div>
        <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600, marginTop: 2 }}>Admin Login</div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          style={{ padding: 14, borderRadius: 12, border: "1.5px solid var(--blue-200)" }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 14, borderRadius: 12, border: "1.5px solid var(--blue-200)" }}
        />
        {error && <div style={{ color: "var(--red-600, #dc2626)", fontSize: 13, fontWeight: 600 }}>{error}</div>}
        <button
          type="submit"
          disabled={loading}
          className="primary-btn"
          style={{ padding: 14, borderRadius: 14, fontWeight: 800 }}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}