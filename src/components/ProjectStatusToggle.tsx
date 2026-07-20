"use client";

import { Switch } from "@heroui/react/switch";

interface ProjectStatusToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
}

export function ProjectStatusToggle({
  checked,
  onCheckedChange,
  disabled,
  "aria-label": ariaLabel,
}: ProjectStatusToggleProps) {
  return (
    <Switch
      size="sm"
      isSelected={checked}
      onChange={onCheckedChange}
      isDisabled={disabled}
      aria-label={ariaLabel}
    >
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}
