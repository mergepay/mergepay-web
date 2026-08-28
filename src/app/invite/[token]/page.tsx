import { notFound, redirect } from "next/navigation";
import { inviteJoinPath } from "@/lib/inviteLink";

/** Backwards-compatible deep link for QR scanners and external invite links. */
export default function InviteTokenPage({
  params,
}: {
  params: { token: string };
}) {
  const path = inviteJoinPath(params.token);
  if (!path) notFound();
  redirect(path);
}
