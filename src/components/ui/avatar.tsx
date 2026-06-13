import { cn } from "@/lib/utils";
import { avatarColor, initials } from "@/lib/format";
import type { User } from "@/lib/types";

export function Avatar({
  user,
  size = "md",
  className,
}: {
  user: Pick<User, "displayName" | "stellarPublicKey" | "avatarUrl">;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "h-7 w-7 text-[10px]",
    md: "h-9 w-9 text-xs",
    lg: "h-14 w-14 text-lg",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-xl border-2 border-ink font-display uppercase shrink-0 overflow-hidden shadow-brutal-sm",
        sizes[size],
        className
      )}
      style={{ backgroundColor: avatarColor(user.stellarPublicKey) }}
      title={user.displayName}
    >
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt={user.displayName} className="h-full w-full object-cover" />
      ) : (
        <span className="text-ink">{initials(user.displayName)}</span>
      )}
    </span>
  );
}
