import { getApiKeyStatuses } from "@/services/settings";
import { ApiKeyForm } from "@/components/ApiKeyForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const statuses = await getApiKeyStatuses();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-[13px] text-muted mt-1">
          Keys are stored locally and used only on this machine to call the model
          provider directly for extraction jobs.
        </p>
      </div>

      <div className="space-y-3">
        {statuses.map((status) => (
          <ApiKeyForm key={status.provider} initialStatus={status} />
        ))}
      </div>
    </div>
  );
}
