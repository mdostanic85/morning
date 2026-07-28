"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { Heading } from "@/components/Heading";

const schema = z.object({
  name: z.string().optional(),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
});

type FormValues = z.infer<typeof schema>;

interface ProfileFormProps {
  initialEmail: string | null;
  initialName: string | null;
}

export function ProfileForm({ initialEmail, initialName }: ProfileFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: initialEmail ?? "", name: initialName ?? "" },
  });

  async function onSubmit(values: FormValues) {
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = (await res.json()) as { error?: string };
    if (res.ok) {
      Toast.toast.success("Profile saved.");
      router.refresh();
    } else {
      Toast.toast.danger(data.error ?? "Could not save profile.");
    }
  }

  return (
    <section className="app-card p-6">
      <Heading level={2} visualLevel={5}>Your profile</Heading>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Work email for OAuth context when connecting sources.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
        <input type="hidden" {...register("name")} />
        <div className="form-inline">
          <Input
            {...register("email")}
            type="email"
            placeholder="you@company.com"
            aria-label="Work email"
            aria-invalid={!!errors.email}
            fullWidth
            className="h-11 border border-border bg-background/70 text-sm shadow-none"
          />
          <Button type="submit" variant="outline" isDisabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        </div>
        {errors.email && (
          <p className="text-metadata text-danger">{errors.email.message}</p>
        )}
      </form>
    </section>
  );
}
