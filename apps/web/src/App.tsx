import { useEffect, useState } from "react";
import { api, setBearer } from "./lib/api";
import type { Me } from "./lib/types";
import { Login } from "./views/Login";
import { Panel } from "./views/Panel";
import { Studio } from "./views/Studio";

// Operator links carry the token in the URL fragment (#token=…) so it never
// reaches server logs. Pull it out once on load.
function readTokenFromHash(): string | null {
  const m = location.hash.match(/token=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = async () => {
    const token = readTokenFromHash();
    if (token) {
      setBearer(token);
      // Clear the fragment so the token isn't left in the address bar/history.
      history.replaceState(null, "", location.pathname + location.search);
    }
    try {
      setMe(await api.me());
    } catch {
      setMe({ authenticated: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void bootstrap();
  }, []);

  if (loading) {
    return <div className="min-h-full grid place-items-center text-slate-600">Loading…</div>;
  }

  if (!me?.authenticated) {
    return <Login onLogin={() => void bootstrap()} />;
  }

  // Operators only ever get the control panel. Owners get the studio at "/" and
  // the panel at "/panel".
  const wantsPanel = location.pathname.startsWith("/panel");
  if (me.role === "operator" || wantsPanel) {
    return <Panel me={me} />;
  }

  return (
    <Studio
      onLogout={async () => {
        await api.logout();
        setMe({ authenticated: false });
      }}
    />
  );
}
