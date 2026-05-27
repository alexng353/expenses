import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { api } from "../lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      });
      await qc.invalidateQueries({ queryKey: ["auth"] });
      navigate("/");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Verification failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await api("/auth/resend-code", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    } catch {
      // silently ignore resend failures
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Verify Email</h1>
          <p className="text-muted-foreground text-sm">
            Enter the 6-digit code sent to <strong>{email}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            className="border-input bg-background w-full rounded-md border px-3 py-4 text-center text-2xl tracking-[0.5em]"
            maxLength={6}
            autoFocus
            required
          />

          {error && (
            <p className="text-destructive text-center text-sm">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || code.length !== 6}
          >
            {loading ? "Verifying..." : "Verify"}
          </Button>
        </form>

        <p className="text-muted-foreground text-center text-sm">
          Didn't receive a code?{" "}
          <button onClick={handleResend} className="underline">
            Resend
          </button>
        </p>
      </div>
    </div>
  );
}
