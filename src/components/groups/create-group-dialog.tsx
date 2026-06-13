"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label, FieldHint } from "@/components/ui/input";
import { useCreateGroup } from "@/lib/queries";
import { ApiRequestError } from "@/lib/api";

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const { group } = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success("Group created");
      onClose();
      setName("");
      setDescription("");
      router.push(`/groups/${group.id}`);
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.message : "Could not create group");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New group">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="g-name">Group name</Label>
          <Input
            id="g-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Apartment 4B, Lagos trip…"
            maxLength={60}
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="g-desc">Description (optional)</Label>
          <Textarea
            id="g-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this circle for?"
            maxLength={280}
          />
          <FieldHint>You can invite members once the group exists.</FieldHint>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
            Create group
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
