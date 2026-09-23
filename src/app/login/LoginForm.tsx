"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { login, type LoginState } from "./actions";

const inputClass =
  "w-full rounded-[11px] border border-line bg-field px-[13px] py-3 text-base text-ink focus:border-accent focus:bg-white focus:shadow-[0_0_0_3px_var(--color-accent-soft)] focus:outline-none";
const labelClass = "mb-1.5 block text-[12.5px] font-semibold text-muted";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.email}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="password" className={labelClass}>
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </div>

      {state.error && (
        <p role="alert" className="rounded-[11px] border border-bad-line bg-bad-soft px-[13px] py-2.5 text-[13.5px] font-medium text-bad">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="mt-1 transition-opacity disabled:opacity-60">
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
