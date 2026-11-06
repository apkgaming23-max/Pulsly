import { useState } from "react";
import { Activity, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { supabase } from "./lib/supabase";

export default function Auth() {
  const [mode, setMode] = useState("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (mode === "signup") {
        if (!fullName.trim()) {
          throw new Error("Skriv ditt namn.");
        }

        const { data, error: signUpError } =
          await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: {
                full_name: fullName.trim(),
              },
            },
          });

        if (signUpError) {
          throw signUpError;
        }

        if (!data.session) {
          setMessage(
            "Kontot skapades. Kontrollera din e-post och bekräfta kontot innan du loggar in."
          );
        } else {
          setMessage("Kontot skapades. Du är nu inloggad.");
        }
      } else {
        const { error: signInError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (signInError) {
          throw signInError;
        }
      }
    } catch (err) {
      setError(
        err?.message || "Något gick fel. Försök igen."
      );
    } finally {
      setLoading(false);
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <Activity size={28} />
          </div>

          <div>
            <h1>Pulsly</h1>
            <p>Rörelse som räknas</p>
          </div>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => switchMode("login")}
          >
            Logga in
          </button>

          <button
            type="button"
            className={mode === "signup" ? "active" : ""}
            onClick={() => switchMode("signup")}
          >
            Skapa konto
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label>
              Namn

              <div className="auth-input">
                <User size={19} />

                <input
                  type="text"
                  value={fullName}
                  onChange={(event) =>
                    setFullName(event.target.value)
                  }
                  placeholder="Förnamn Efternamn"
                  autoComplete="name"
                />
              </div>
            </label>
          )}

          <label>
            E-post

            <div className="auth-input">
              <Mail size={19} />

              <input
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="namn@exempel.se"
                autoComplete="email"
                required
              />
            </div>
          </label>

          <label>
            Lösenord

            <div className="auth-input">
              <Lock size={19} />

              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="Minst 6 tecken"
                minLength={6}
                autoComplete={
                  mode === "login"
                    ? "current-password"
                    : "new-password"
                }
                required
              />

              <button
                type="button"
                className="show-password"
                onClick={() =>
                  setShowPassword((current) => !current)
                }
                aria-label={
                  showPassword
                    ? "Dölj lösenord"
                    : "Visa lösenord"
                }
              >
                {showPassword ? (
                  <EyeOff size={19} />
                ) : (
                  <Eye size={19} />
                )}
              </button>
            </div>
          </label>

          {error && (
            <div className="auth-message error">
              {error}
            </div>
          )}

          {message && (
            <div className="auth-message success">
              {message}
            </div>
          )}

          <button
            className="auth-submit"
            disabled={loading}
            type="submit"
          >
            {loading
              ? "Vänta..."
              : mode === "login"
                ? "Logga in"
                : "Skapa konto"}
          </button>
        </form>

        <p className="auth-footer">
          Aktiviteter, hälsodata och GPS-data skyddas
          genom ditt personliga Pulsly-konto.
        </p>
      </div>

      <style>{`
        .auth-page {
          min-height: 100vh;
          background:
            radial-gradient(circle at top right, #d1fae5, transparent 35%),
            linear-gradient(145deg, #f8fafc, #ecfdf5);
          display: grid;
          place-items: center;
          padding: 20px;
        }

        .auth-card {
          width: 100%;
          max-width: 440px;
          padding: 30px;
          background: white;
          border-radius: 28px;
          box-shadow: 0 20px 60px rgba(15, 23, 42, 0.1);
        }

        .auth-logo {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 28px;
        }

        .auth-logo-icon {
          width: 52px;
          height: 52px;
          border-radius: 17px;
          display: grid;
          place-items: center;
          color: white;
          background: linear-gradient(135deg, #10b981, #14b8a6);
        }

        .auth-logo h1 {
          margin: 0;
          font-size: 28px;
        }

        .auth-logo p {
          margin: 2px 0 0;
          color: #64748b;
        }

        .auth-tabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
          background: #f1f5f9;
          border-radius: 14px;
          padding: 4px;
          margin-bottom: 24px;
        }

        .auth-tabs button {
          border: 0;
          padding: 11px;
          border-radius: 11px;
          background: transparent;
          color: #64748b;
          font-weight: 800;
        }

        .auth-tabs button.active {
          background: white;
          color: #059669;
          box-shadow: 0 2px 5px rgba(15, 23, 42, 0.08);
        }

        .auth-card label {
          display: block;
          margin-bottom: 17px;
          font-size: 13px;
          font-weight: 800;
        }

        .auth-input {
          margin-top: 7px;
          border: 1px solid #e2e8f0;
          border-radius: 13px;
          display: flex;
          align-items: center;
          padding: 0 13px;
          color: #94a3b8;
        }

        .auth-input:focus-within {
          border-color: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
        }

        .auth-input input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          padding: 13px 10px;
          color: #0f172a;
        }

        .show-password {
          border: 0;
          background: transparent;
          color: #64748b;
          display: grid;
          place-items: center;
        }

        .auth-submit {
          width: 100%;
          border: 0;
          border-radius: 13px;
          padding: 14px;
          background: #0f172a;
          color: white;
          font-weight: 900;
          margin-top: 5px;
        }

        .auth-submit:hover {
          background: #059669;
        }

        .auth-submit:disabled {
          opacity: 0.65;
        }

        .auth-message {
          border-radius: 12px;
          padding: 11px 13px;
          margin-bottom: 15px;
          font-size: 13px;
        }

        .auth-message.error {
          color: #9f1239;
          background: #fff1f2;
        }

        .auth-message.success {
          color: #047857;
          background: #ecfdf5;
        }

        .auth-footer {
          text-align: center;
          margin: 22px 10px 0;
          color: #94a3b8;
          font-size: 12px;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
