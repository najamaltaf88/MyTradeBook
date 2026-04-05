import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, LineChart, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase, supabaseEnabled } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type AuthMode = "sign-in" | "sign-up" | "forgot-password" | "reset-password";

type LoginPageProps = {
  isRecovery?: boolean;
  onRecoveryComplete?: () => void;
};

const PASSWORD_HINTS = [
  "Use at least 8 characters.",
  "Mix letters, numbers, and symbols.",
  "Avoid reusing broker or MT5 passwords.",
];

const WORKSPACE_BENEFITS = [
  "Secure sign-in with your own account session",
  "Journal, goals, notes, and coaching saved in one workspace",
  "Recovery flow available if you forget your password",
];

const RECOVERY_STEPS = [
  {
    title: "Send reset email",
    description: "Use your account email to request a recovery message.",
  },
  {
    title: "Enter code or open link",
    description: "Paste the code from email, or let the app verify the recovery link automatically.",
  },
  {
    title: "Save new password",
    description: "Choose a stronger password and return to your workspace.",
  },
];

function getRedirectUrl() {
  if (typeof window === "undefined") return undefined;
  return window.location.origin;
}

function readRecoveryParam(key: string) {
  if (typeof window === "undefined") return "";
  const search = new URLSearchParams(window.location.search);
  const fromSearch = search.get(key);
  if (fromSearch) return fromSearch;

  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const fromHash = new URLSearchParams(hash).get(key);
  return fromHash ?? "";
}

export default function LoginPage({
  isRecovery = false,
  onRecoveryComplete,
}: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>(isRecovery ? "reset-password" : "sign-in");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoverySessionReady, setRecoverySessionReady] = useState(false);
  const [preparingRecovery, setPreparingRecovery] = useState(false);

  const resetRecoveryState = () => {
    setRecoverySessionReady(false);
    setRecoveryCode("");
  };

  const sendRecoveryEmail = async () => {
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getRedirectUrl(),
    });
    if (resetError) throw resetError;
    setMode("reset-password");
    setRecoverySessionReady(false);
    setRecoveryCode("");
    setPassword("");
    setConfirmPassword("");
    setMessage("Reset email sent. Enter the code from that email here. If the email opens a recovery link instead, this screen will finish it too.");
  };

  useEffect(() => {
    if (isRecovery) {
      setMode("reset-password");
      setMessage("Checking your recovery request. If you already have a code, you can reset your password right here.");
      setError(null);
    }
  }, [isRecovery]);

  useEffect(() => {
    if (mode !== "reset-password" || !supabaseEnabled) return;

    let cancelled = false;

    const prepareRecovery = async () => {
      const tokenHash = readRecoveryParam("token_hash");
      const recoveryType = readRecoveryParam("type");

      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        if (data.session) {
          setRecoverySessionReady(true);
          if (isRecovery) {
            setMessage("Recovery verified. Set your new password below.");
          }
          return;
        }

        if (!isRecovery || !tokenHash || recoveryType !== "recovery") {
          return;
        }

        setPreparingRecovery(true);
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });

        if (cancelled) return;
        if (verifyError) throw verifyError;

        setRecoverySessionReady(true);
        setMessage("Recovery verified. Set your new password below.");
        setError(null);
      } catch (recoveryError) {
        if (cancelled) return;
        const nextMessage =
          recoveryError instanceof Error
            ? recoveryError.message
            : "We could not verify that recovery request. Request a new reset code and try again.";
        setError(nextMessage);
      } finally {
        if (!cancelled) {
          setPreparingRecovery(false);
        }
      }
    };

    void prepareRecovery();

    return () => {
      cancelled = true;
    };
  }, [isRecovery, mode]);

  const heading = useMemo(() => {
    if (mode === "sign-up") return "Create your workspace";
    if (mode === "forgot-password") return "Recover your password";
    if (mode === "reset-password") return recoverySessionReady ? "Set a new password" : "Enter your reset code";
    return "Welcome back";
  }, [mode, recoverySessionReady]);

  const subheading = useMemo(() => {
    if (mode === "sign-up") return "Professional journaling starts with a clean, secure account.";
    if (mode === "forgot-password") return "We will send a reset email so you can finish recovery inside the app.";
    if (mode === "reset-password") {
      return recoverySessionReady
        ? "Finish recovery by saving a strong new password."
        : "Enter the reset code from your email, then save your new password here.";
    }
    return "Sign in to continue with your trading journal and analytics.";
  }, [mode, recoverySessionReady]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabaseEnabled) {
      setError("Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }

    if (mode === "reset-password" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if ((mode === "sign-up" || mode === "reset-password") && password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }

    if (mode === "reset-password" && !recoverySessionReady) {
      if (!email.trim()) {
        setError("Enter the email address for the account you want to recover.");
        return;
      }
      if (recoveryCode.trim().length < 6) {
        setError("Enter the reset code from your email.");
        return;
      }
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === "sign-in") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      } else if (mode === "sign-up") {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setMessage("Account created. Check your email if confirmation is required.");
      } else if (mode === "forgot-password") {
        await sendRecoveryEmail();
      } else {
        if (!recoverySessionReady) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            email,
            token: recoveryCode,
            type: "recovery",
          });
          if (verifyError) throw verifyError;
          setRecoverySessionReady(true);
        }

        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        onRecoveryComplete?.();
        setConfirmPassword("");
        setPassword("");
        setRecoveryCode("");
        setMessage("Password updated. You can continue into your workspace now.");
      }
    } catch (submitError) {
      const nextMessage =
        submitError instanceof Error ? submitError.message : "Something went wrong. Please try again.";
      setError(nextMessage);
    } finally {
      setLoading(false);
    }
  };

  const showEmailField = mode !== "sign-in" || !recoverySessionReady;
  const showPasswordField = mode !== "forgot-password";
  const showConfirmPassword = mode === "reset-password";
  const showRecoveryCodeField = mode === "reset-password" && !recoverySessionReady;
  const resetSubmitLabel = recoverySessionReady ? "Save New Password" : "Verify Code & Save Password";
  const currentRecoveryStep = recoverySessionReady ? 3 : mode === "reset-password" ? 2 : 1;

  const handleResendReset = async () => {
    if (!email.trim()) {
      setError("Enter your account email first, then resend the reset email.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await sendRecoveryEmail();
    } catch (submitError) {
      const nextMessage =
        submitError instanceof Error ? submitError.message : "We could not resend the reset email. Please try again.";
      setError(nextMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-background px-4 py-6 sm:px-6 lg:px-10"
      data-testid="page-login"
    >
      <div className="relative mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <Card className="border-border shadow-xl">
          <CardContent className="flex h-full flex-col justify-between gap-8 p-6 sm:p-8">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                MyTradebook
              </div>

              <div className="space-y-4">
                <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                  Trade review that feels calm, sharp, and actually usable.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Keep your journal, goals, notes, and coaching in one professional workspace with a cleaner auth experience and password recovery built in.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-border bg-background p-4">
                  <LineChart className="h-5 w-5 text-primary" />
                  <div className="mt-3 text-sm font-semibold">Performance clarity</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">Track outcomes, edge, and execution quality without clutter.</div>
                </div>
                <div className="rounded-3xl border border-border bg-background p-4">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <div className="mt-3 text-sm font-semibold">Secure access</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">Separate account login from broker credentials and keep recovery available.</div>
                </div>
                <div className="rounded-3xl border border-border bg-background p-4">
                  <KeyRound className="h-5 w-5 text-primary" />
                  <div className="mt-3 text-sm font-semibold">Recovery ready</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">Forgot-password flow now fits the rest of the workspace instead of being missing.</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              {WORKSPACE_BENEFITS.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-border bg-background px-4 py-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                  <span className="text-sm text-foreground">{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-2xl">
          <CardContent className="p-6 sm:p-8">
            <div className="mb-6 space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                <LockKeyhole className="h-3.5 w-3.5" />
                Secure account access
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">{heading}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{subheading}</p>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-muted/50 p-1">
              <Button
                type="button"
                variant={mode === "sign-in" ? "default" : "ghost"}
                className="rounded-xl"
                onClick={() => {
                  setMode("sign-in");
                  setError(null);
                  setMessage(null);
                  resetRecoveryState();
                }}
                disabled={isRecovery}
              >
                Sign In
              </Button>
              <Button
                type="button"
                variant={mode === "sign-up" ? "default" : "ghost"}
                className="rounded-xl"
                onClick={() => {
                  setMode("sign-up");
                  setError(null);
                  setMessage(null);
                  resetRecoveryState();
                }}
                disabled={isRecovery}
              >
                Sign Up
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "reset-password" ? (
                <div className="rounded-[1.6rem] border border-border bg-background p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Recovery Steps
                      </div>
                      <p className="mt-1 text-sm text-foreground">
                        Finish the reset here without leaving the app.
                      </p>
                    </div>
                    <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      Step {currentRecoveryStep} of 3
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {RECOVERY_STEPS.map((step, index) => {
                      const stepNumber = index + 1;
                      const isDone = stepNumber < currentRecoveryStep;
                      const isActive = stepNumber === currentRecoveryStep;

                      return (
                        <div
                          key={step.title}
                          className={cn(
                            "flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors",
                            isActive
                              ? "border-primary/35 bg-primary/10"
                              : isDone
                              ? "border-emerald-500/25 bg-emerald-500/8"
                              : "border-border bg-card",
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                              isActive
                                ? "border-primary/40 bg-primary text-primary-foreground"
                                : isDone
                                ? "border-emerald-500/30 bg-emerald-500 text-white"
                                : "border-border/70 bg-background text-muted-foreground",
                            )}
                          >
                            {isDone ? <CheckCircle2 className="h-4 w-4" /> : stepNumber}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-foreground">{step.title}</div>
                            <div className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {showEmailField ? (
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="pl-10"
                      required={mode !== "sign-in" || !recoverySessionReady}
                      readOnly={mode === "reset-password" && recoverySessionReady}
                      data-testid="input-login-email"
                    />
                  </div>
                </div>
              ) : null}

              {showRecoveryCodeField ? (
                <div className="space-y-2">
                  <Label htmlFor="reset-code">Reset Code</Label>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <InputOTP
                      id="reset-code"
                      maxLength={6}
                      value={recoveryCode}
                      onChange={setRecoveryCode}
                      containerClassName="justify-between"
                      pattern={String.raw`\d*`}
                      data-testid="input-login-recovery-code"
                    >
                      <InputOTPGroup className="w-full justify-between gap-2">
                        {Array.from({ length: 6 }, (_, index) => (
                          <InputOTPSlot
                            key={index}
                            index={index}
                            className="h-12 w-12 rounded-2xl border border-border bg-card text-base shadow-sm first:rounded-2xl first:border last:rounded-2xl"
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      Paste or type the one-time reset code from your email. If Supabase opened a recovery link instead, this screen will detect it automatically.
                    </p>
                  </div>
                </div>
              ) : null}

              {showPasswordField ? (
                <div className="space-y-2">
                  <Label htmlFor="password">{mode === "reset-password" ? "New Password" : "Password"}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={mode === "sign-in" ? "Enter your password" : "Create a strong password"}
                    required
                    data-testid="input-login-password"
                  />
                </div>
              ) : null}

              {showConfirmPassword ? (
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat your new password"
                    required
                    data-testid="input-login-confirm-password"
                  />
                </div>
              ) : null}

              {(mode === "sign-up" || mode === "reset-password") && (
                <div className="rounded-2xl border border-border bg-background p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Password checklist</div>
                  <div className="mt-3 space-y-2">
                    {PASSWORD_HINTS.map((hint) => (
                      <div key={hint} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className={cn("mt-0.5 h-4 w-4", password.length >= 8 ? "text-emerald-500" : "text-muted-foreground")} />
                        <span>{hint}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error ? <p className="text-sm text-red-500">{error}</p> : null}
              {message ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p> : null}
              {preparingRecovery ? <p className="text-sm text-primary">Verifying recovery request...</p> : null}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || preparingRecovery || !supabaseEnabled}
                data-testid="button-login-submit"
              >
                {loading
                  ? "Please wait..."
                  : mode === "sign-in"
                  ? "Sign In"
                  : mode === "sign-up"
                  ? "Create Account"
                  : mode === "forgot-password"
                  ? "Send Reset Email"
                  : resetSubmitLabel}
              </Button>

              {mode === "reset-password" && !recoverySessionReady ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    void handleResendReset();
                  }}
                  disabled={loading || preparingRecovery || !supabaseEnabled}
                  data-testid="button-login-resend-reset"
                >
                  Resend Reset Email
                </Button>
              ) : null}
            </form>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
              {mode === "sign-in" ? (
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot-password");
                    setError(null);
                    setMessage(null);
                    resetRecoveryState();
                  }}
                  className="text-primary underline-offset-4 hover:underline"
                  data-testid="button-forgot-password"
                >
                  Forgot password?
                </button>
              ) : mode === "forgot-password" ? (
                <button
                  type="button"
                  onClick={() => {
                    setMode("sign-in");
                    setError(null);
                    setMessage(null);
                    resetRecoveryState();
                  }}
                  className="text-primary underline-offset-4 hover:underline"
                  data-testid="button-back-to-sign-in"
                >
                  Back to sign in
                </button>
              ) : (
                <span className="text-muted-foreground">
                  {mode === "reset-password"
                    ? recoverySessionReady
                      ? "Recovery verified"
                      : "Enter the code from your email"
                    : "Already have an account?"}
                </span>
              )}

              {mode === "sign-up" ? (
                <button
                  type="button"
                  onClick={() => {
                    setMode("sign-in");
                    setError(null);
                    setMessage(null);
                    resetRecoveryState();
                  }}
                  className="text-primary underline-offset-4 hover:underline"
                  data-testid="button-login-toggle"
                >
                  Sign in instead
                </button>
              ) : mode === "sign-in" ? (
                <button
                  type="button"
                  onClick={() => {
                    setMode("sign-up");
                    setError(null);
                    setMessage(null);
                    resetRecoveryState();
                  }}
                  className="text-primary underline-offset-4 hover:underline"
                  data-testid="button-login-toggle"
                >
                  Create an account
                </button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
