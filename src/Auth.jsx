import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  User,
} from "lucide-react";
import { supabase } from "./lib/supabase";

export default function Auth() {
  const [mode, setMode] = useState("login");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [loading, setLoading] = useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  useEffect(() => {
    async function checkRecovery() {
      const hash = window.location.hash;
      const search = window.location.search;

      if (
        hash.includes("type=recovery") ||
        search.includes("type=recovery")
      ) {
        setMode("new-password");
      }
    }

    checkRecovery();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "PASSWORD_RECOVERY") {
          setMode("new-password");
          setError("");
          setMessage("");
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  function clearMessages() {
    setError("");
    setMessage("");
  }

  function changeMode(nextMode) {
    clearMessages();

    setPassword("");
    setConfirmPassword("");
    setMode(nextMode);
  }

  async function handleLogin(event) {
    event.preventDefault();

    setLoading(true);
    clearMessages();

    try {
      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (loginError) {
        if (
          loginError.message
            .toLowerCase()
            .includes("invalid login")
        ) {
          throw new Error(
            "Fel e-postadress eller lösenord."
          );
        }

        if (
          loginError.message
            .toLowerCase()
            .includes("email not confirmed")
        ) {
          throw new Error(
            "E-postadressen är inte bekräftad ännu. Kontrollera din inkorg."
          );
        }

        throw loginError;
      }
    } catch (err) {
      setError(
        err?.message ||
          "Det gick inte att logga in."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(event) {
    event.preventDefault();

    setLoading(true);
    clearMessages();

    try {
      if (!fullName.trim()) {
        throw new Error(
          "Skriv ditt namn."
        );
      }

      if (password.length < 8) {
        throw new Error(
          "Lösenordet måste innehålla minst 8 tecken."
        );
      }

      if (password !== confirmPassword) {
        throw new Error(
          "Lösenorden är inte likadana."
        );
      }

      const { data, error: signupError } =
        await supabase.auth.signUp({
          email: email.trim(),
          password,

          options: {
            data: {
              full_name:
                fullName.trim(),
            },

            emailRedirectTo:
              window.location.origin,
          },
        });

      if (signupError) {
        throw signupError;
      }

      if (data.session) {
        setMessage(
          "Kontot är skapat. Du loggas in."
        );
      } else {
        setMessage(
          "Kontot är skapat. Vi har skickat ett bekräftelsemail till din e-postadress."
        );
      }
    } catch (err) {
      setError(
        err?.message ||
          "Det gick inte att skapa kontot."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(
    event
  ) {
    event.preventDefault();

    setLoading(true);
    clearMessages();

    try {
      if (!email.trim()) {
        throw new Error(
          "Skriv e-postadressen som är kopplad till ditt Pulsly-konto."
        );
      }

      const redirectTo =
        `${window.location.origin}/`;

      const {
        error: resetError,
      } =
        await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo,
          }
        );

      if (resetError) {
        throw resetError;
      }

      setMessage(
        "Om e-postadressen finns i Pulsly har ett återställningsmail skickats. Öppna länken i mailet för att välja ett nytt lösenord."
      );
    } catch (err) {
      setError(
        err?.message ||
          "Det gick inte att skicka återställningsmailet."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleNewPassword(
    event
  ) {
    event.preventDefault();

    setLoading(true);
    clearMessages();

    try {
      if (password.length < 8) {
        throw new Error(
          "Det nya lösenordet måste innehålla minst 8 tecken."
        );
      }

      if (password !== confirmPassword) {
        throw new Error(
          "Lösenorden är inte likadana."
        );
      }

      const {
        error: updateError,
      } =
        await supabase.auth.updateUser({
          password,
        });

      if (updateError) {
        throw updateError;
      }

      setPassword("");
      setConfirmPassword("");

      setMessage(
        "Ditt lösenord har ändrats."
      );

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );

      setTimeout(() => {
        setMode("login");
      }, 1800);
    } catch (err) {
      setError(
        err?.message ||
          "Det gick inte att ändra lösenordet."
      );
    } finally {
      setLoading(false);
    }
  }

  function submitHandler(event) {
    if (mode === "login") {
      return handleLogin(event);
    }

    if (mode === "signup") {
      return handleSignup(event);
    }

    if (mode === "forgot") {
      return handleForgotPassword(
        event
      );
    }

    if (
      mode === "new-password"
    ) {
      return handleNewPassword(
        event
      );
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-background-one" />
      <div className="auth-background-two" />

      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">
            <Activity size={29} />
          </div>

          <div>
            <h1>Pulsly</h1>
            <p>
              Rörelse som räknas
            </p>
          </div>
        </div>

        {mode === "login" && (
          <>
            <div className="auth-heading">
              <h2>Välkommen tillbaka</h2>

              <p>
                Logga in för att se dina
                aktiviteter, utmaningar
                och poäng.
              </p>
            </div>

            <div className="auth-tabs">
              <button className="active">
                Logga in
              </button>

              <button
                onClick={() =>
                  changeMode("signup")
                }
              >
                Skapa konto
              </button>
            </div>
          </>
        )}

        {mode === "signup" && (
          <>
            <div className="auth-heading">
              <h2>Skapa Pulsly-konto</h2>

              <p>
                Börja registrera
                verifierad aktivitet.
              </p>
            </div>

            <div className="auth-tabs">
              <button
                onClick={() =>
                  changeMode("login")
                }
              >
                Logga in
              </button>

              <button className="active">
                Skapa konto
              </button>
            </div>
          </>
        )}

        {mode === "forgot" && (
          <div className="auth-heading">
            <div className="mode-icon">
              <KeyRound size={25} />
            </div>

            <h2>
              Glömt lösenord?
            </h2>

            <p>
              Skriv e-postadressen
              till ditt Pulsly-konto.
              Vi skickar en länk för
              att välja ett nytt
              lösenord.
            </p>
          </div>
        )}

        {mode ===
          "new-password" && (
          <div className="auth-heading">
            <div className="mode-icon">
              <Lock size={25} />
            </div>

            <h2>
              Välj nytt lösenord
            </h2>

            <p>
              Ange det nya lösenordet
              två gånger.
            </p>
          </div>
        )}

        <form
          onSubmit={submitHandler}
        >
          {mode === "signup" && (
            <label>
              Namn

              <div className="auth-input">
                <User size={19} />

                <input
                  type="text"
                  placeholder="Förnamn Efternamn"
                  value={fullName}
                  onChange={(event) =>
                    setFullName(
                      event.target.value
                    )
                  }
                  autoComplete="name"
                  required
                />
              </div>
            </label>
          )}

          {(mode === "login" ||
            mode === "signup" ||
            mode === "forgot") && (
            <label>
              E-post

              <div className="auth-input">
                <Mail size={19} />

                <input
                  type="email"
                  placeholder="namn@exempel.se"
                  value={email}
                  onChange={(event) =>
                    setEmail(
                      event.target.value
                    )
                  }
                  autoComplete="email"
                  required
                />
              </div>
            </label>
          )}

          {(mode === "login" ||
            mode === "signup" ||
            mode ===
              "new-password") && (
            <label>
              {mode ===
              "new-password"
                ? "Nytt lösenord"
                : "Lösenord"}

              <div className="auth-input">
                <Lock size={19} />

                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  placeholder="Minst 8 tecken"
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value
                    )
                  }
                  minLength={8}
                  autoComplete={
                    mode === "login"
                      ? "current-password"
                      : "new-password"
                  }
                  required
                />

                <button
                  type="button"
                  className="eye-button"
                  onClick={() =>
                    setShowPassword(
                      (current) =>
                        !current
                    )
                  }
                  aria-label={
                    showPassword
                      ? "Dölj lösenord"
                      : "Visa lösenord"
                  }
                >
                  {showPassword ? (
                    <EyeOff
                      size={19}
                    />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>
            </label>
          )}

          {(mode === "signup" ||
            mode ===
              "new-password") && (
            <label>
              Bekräfta lösenord

              <div className="auth-input">
                <Lock size={19} />

                <input
                  type={
                    showConfirmPassword
                      ? "text"
                      : "password"
                  }
                  placeholder="Skriv lösenordet igen"
                  value={
                    confirmPassword
                  }
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target.value
                    )
                  }
                  minLength={8}
                  autoComplete="new-password"
                  required
                />

                <button
                  type="button"
                  className="eye-button"
                  onClick={() =>
                    setShowConfirmPassword(
                      (current) =>
                        !current
                    )
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff
                      size={19}
                    />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>
            </label>
          )}

          {mode === "login" && (
            <div className="forgot-row">
              <button
                type="button"
                onClick={() =>
                  changeMode("forgot")
                }
              >
                Glömt lösenord?
              </button>
            </div>
          )}

          {error && (
            <div className="auth-alert auth-error">
              {error}
            </div>
          )}

          {message && (
            <div className="auth-alert auth-success">
              <CheckCircle2
                size={18}
              />

              <span>
                {message}
              </span>
            </div>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Vänta..."
              : mode === "login"
              ? "Logga in"
              : mode === "signup"
              ? "Skapa konto"
              : mode === "forgot"
              ? "Skicka återställningsmail"
              : "Spara nytt lösenord"}
          </button>

          {(mode === "forgot" ||
            mode ===
              "new-password") && (
            <button
              type="button"
              className="back-button"
              onClick={() =>
                changeMode("login")
              }
            >
              <ArrowLeft
                size={17}
              />

              Tillbaka till
              inloggning
            </button>
          )}
        </form>

        <div className="auth-security">
          <Lock size={15} />

          <span>
            Ditt konto skyddar dina
            aktiviteter, hälsodata och
            privata GPS-rutter.
          </span>
        </div>
      </div>

      <style>{`
        .auth-page {
          min-height: 100vh;
          padding: 24px;
          display: grid;
          place-items: center;
          position: relative;
          overflow: hidden;
          background:
            linear-gradient(
              145deg,
              #f8fafc,
              #ecfdf5
            );
        }

        .auth-background-one,
        .auth-background-two {
          position: absolute;
          border-radius: 999px;
          filter: blur(5px);
          pointer-events: none;
        }

        .auth-background-one {
          width: 520px;
          height: 520px;
          right: -180px;
          top: -220px;
          background:
            rgba(
              16,
              185,
              129,
              .15
            );
        }

        .auth-background-two {
          width: 420px;
          height: 420px;
          left: -180px;
          bottom: -220px;
          background:
            rgba(
              20,
              184,
              166,
              .12
            );
        }

        .auth-card {
          position: relative;
          width: 100%;
          max-width: 455px;
          background: rgba(
            255,
            255,
            255,
            .97
          );
          border: 1px solid
            rgba(
              226,
              232,
              240,
              .9
            );
          border-radius: 30px;
          padding: 32px;
          box-shadow:
            0 28px 70px
            rgba(
              15,
              23,
              42,
              .12
            );
        }

        .auth-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 28px;
        }

        .auth-logo {
          width: 54px;
          height: 54px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          color: white;
          background:
            linear-gradient(
              135deg,
              #10b981,
              #14b8a6
            );
          box-shadow:
            0 10px 25px
            rgba(
              16,
              185,
              129,
              .25
            );
        }

        .auth-brand h1 {
          margin: 0;
          font-size: 28px;
          line-height: 1;
        }

        .auth-brand p {
          margin:
            5px 0 0;
          color: #64748b;
          font-size: 13px;
        }

        .auth-heading {
          margin-bottom: 20px;
        }

        .auth-heading h2 {
          margin:
            0 0 7px;
          font-size: 25px;
        }

        .auth-heading p {
          margin: 0;
          color: #64748b;
          font-size: 14px;
          line-height: 1.6;
        }

        .mode-icon {
          width: 47px;
          height: 47px;
          border-radius: 15px;
          background: #ecfdf5;
          color: #059669;
          display: grid;
          place-items: center;
          margin-bottom: 15px;
        }

        .auth-tabs {
          display: grid;
          grid-template-columns:
            1fr 1fr;
          gap: 4px;
          padding: 4px;
          border-radius: 14px;
          background: #f1f5f9;
          margin-bottom: 24px;
        }

        .auth-tabs button {
          border: 0;
          background: transparent;
          color: #64748b;
          padding: 11px;
          border-radius: 11px;
          font-weight: 800;
        }

        .auth-tabs
        button.active {
          background: white;
          color: #059669;
          box-shadow:
            0 2px 8px
            rgba(
              15,
              23,
              42,
              .07
            );
        }

        .auth-card label {
          display: block;
          margin-bottom: 17px;
          color: #334155;
          font-size: 13px;
          font-weight: 800;
        }

        .auth-input {
          margin-top: 7px;
          display: flex;
          align-items: center;
          padding: 0 13px;
          color: #94a3b8;
          background: #fff;
          border:
            1px solid
            #e2e8f0;
          border-radius: 13px;
          transition:
            border-color .15s,
            box-shadow .15s;
        }

        .auth-input:focus-within {
          border-color:
            #10b981;
          box-shadow:
            0 0 0 3px
            rgba(
              16,
              185,
              129,
              .1
            );
        }

        .auth-input input {
          width: 100%;
          min-width: 0;
          border: 0;
          outline: 0;
          padding: 14px 10px;
          color: #0f172a;
          background:
            transparent;
        }

        .eye-button {
          border: 0;
          padding: 6px;
          background: transparent;
          color: #64748b;
          display: grid;
          place-items: center;
        }

        .forgot-row {
          display: flex;
          justify-content:
            flex-end;
          margin:
            -4px 0 18px;
        }

        .forgot-row button {
          border: 0;
          background: transparent;
          color: #059669;
          font-size: 13px;
          font-weight: 800;
        }

        .auth-submit {
          width: 100%;
          min-height: 49px;
          border: 0;
          border-radius: 13px;
          background: #0f172a;
          color: #fff;
          font-weight: 900;
          margin-top: 3px;
          transition:
            background .15s,
            transform .15s;
        }

        .auth-submit:hover {
          background: #059669;
        }

        .auth-submit:active {
          transform:
            scale(.99);
        }

        .auth-submit:disabled {
          opacity: .6;
        }

        .back-button {
          width: 100%;
          border: 0;
          margin-top: 13px;
          padding: 10px;
          background: transparent;
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-weight: 800;
        }

        .auth-alert {
          padding: 12px 14px;
          margin-bottom: 15px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.45;
        }

        .auth-error {
          color: #9f1239;
          background: #fff1f2;
        }

        .auth-success {
          display: flex;
          gap: 8px;
          align-items:
            flex-start;
          color: #047857;
          background: #ecfdf5;
        }

        .auth-success svg {
          flex: 0 0 auto;
          margin-top: 1px;
        }

        .auth-security {
          display: flex;
          gap: 8px;
          align-items:
            flex-start;
          margin-top: 24px;
          padding-top: 19px;
          border-top:
            1px solid
            #f1f5f9;
          color: #94a3b8;
          font-size: 11px;
          line-height: 1.5;
        }

        .auth-security svg {
          flex: 0 0 auto;
          margin-top: 1px;
        }

        @media
        (max-width: 520px) {
          .auth-page {
            padding: 14px;
            align-items:
              center;
          }

          .auth-card {
            padding:
              25px 19px;
            border-radius:
              24px;
          }

          .auth-brand {
            margin-bottom:
              23px;
          }

          .auth-heading h2 {
            font-size: 22px;
          }
        }
      `}</style>
    </div>
  );
}
