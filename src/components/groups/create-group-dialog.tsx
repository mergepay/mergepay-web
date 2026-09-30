"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label, FieldHint } from "@/components/ui/input";
import { useCreateGroup } from "@/lib/queries";
import { handleApiError } from "@/lib/errorHandler";
import {
  createGroupFormSchema,
  fieldErrorsFrom,
} from "@/lib/validators";

export function CreateGroupDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const create = useCreateGroup();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

  function nameError(): string | undefined {
    return errors.name;
  }

  function descriptionError(): string | undefined {
    return errors.description;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isOffline) {
      toast.error("You’re offline — reconnect to create a group");
      return;
    }

    // Runtime gate (#339): reject malformed input before it reaches the API,
    // with the messages rendered inline under each field.
    const parsed = createGroupFormSchema.safeParse({ name, description });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed));
      toast.error("Please fix the errors before submitting");
      return;
    }
    setErrors({});
    try {
      const { group } = await create.mutateAsync(parsed.data);
      toast.success("Group created");
      onClose();
      setName("");
      setDescription("");
      router.push(`/groups/${group.id}`);
    } catch (e) {
      handleApiError(e, "Could not create group");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New group"
      description="Name a new circle. You can invite members once it exists."
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="g-name">Group name</Label>
          <Input
            id="g-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              // Validate on blur so the message appears once the user leaves
              // the field, not on every keystroke.
              const parsed = createGroupFormSchema.shape.name.safeParse(name);
              setErrors((prev) => ({
                ...prev,
                name: parsed.success ? "" : parsed.error.issues[0].message,
              }));
            }}
            placeholder="Apartment 4B, Lagos trip…"
            maxLength={60}
            data-autofocus
            aria-invalid={nameError() ? true : undefined}
            aria-describedby={nameError() ? "g-name-error" : undefined}
            className={nameError() ? "border-flamingo" : undefined}
          />
          {nameError() && (
            <p id="g-name-error" role="alert" className="mt-1 text-xs font-bold text-flamingo">
              {nameError()}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="g-desc">Description (optional)</Label>
          <Textarea
            id="g-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this circle for?"
            maxLength={280}
            aria-invalid={descriptionError() ? true : undefined}
            aria-describedby={descriptionError() ? "g-desc-error" : undefined}
            className={descriptionError() ? "border-flamingo" : undefined}
          />
          {descriptionError() && (
            <p id="g-desc-error" role="alert" className="mt-1 text-xs font-bold text-flamingo">
              {descriptionError()}
            </p>
          )}
          <FieldHint>You can invite members once the group exists.</FieldHint>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={create.isPending}
            disabled={isOffline}
            data-testid="create-group-confirm"
            title={
              isOffline ? "You’re offline — reconnect to create a group" : undefined
            }
          >
            Create group
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
