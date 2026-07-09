"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      toast.success("Profile saved.");
      router.refresh();
    } else {
      toast.error(data.error ?? "Could not save profile.");
    }
  }

  return (
    <section className="card p-6">
      <h2 className="font-display text-lg font-medium">Your profile</h2>
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
          />
          <Button type="submit" variant="outline" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        </div>
        {errors.email && (
          <p className="text-xs text-danger">{errors.email.message}</p>
        )}
      </form>
    </section>
  );
}
