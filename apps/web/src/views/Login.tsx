import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { Button, Card } from "../components/ui";

export function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(username, password);
      onLogin();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Invalid credentials" : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full grid place-items-center p-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1">irlkit</h1>
        <p className="text-slate-500 text-sm mb-5">Owner sign-in</p>
        <form onSubmit={submit} className="space-y-3">
          <input
            className="w-full rounded-xl bg-ink border border-edge px-3 py-3 outline-none focus:border-accent"
            placeholder="Username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="w-full rounded-xl bg-ink border border-edge px-3 py-3 outline-none focus:border-accent"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-live text-sm">{error}</p>}
          <Button variant="primary" type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
