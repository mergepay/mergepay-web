"use client";

/**
 * Code-split versions of heavy, on-demand UI (#887).
 *
 * Every component here is hidden until the user asks for it (a dialog behind
 * a button, or a panel only some groups have), yet each one pulls in a lot of
 * code: form + zod schemas, the SEP-24 flow, CSV/PDF export, treasury
 * multisig. Loading them with `next/dynamic` keeps that code out of the
 * route's first-load JS, which matters most on mobile. (QR rendering is
 * already split out by `ui/lazy-qr-code`, so the QR modals are not wrapped
 * again; doing so measured as a small net loss.)
 *
 * - `ssr: false`: these are client-only interactive surfaces that render
 *   nothing until opened, so server-rendering them only adds HTML and
 *   hydration work. Panels that are visible on load are deliberately *not*
 *   listed here.
 * - Modals pair with `useMountOnFirstOpen` at the call site so the chunk is
 *   fetched on first open, not on page load. While it loads,
 *   `ModalLoadingFallback` shows a fixed overlay shaped like the dialog, so
 *   nothing in the page moves.
 * - `PanelLoadingFallback` reserves the panel's height for in-flow content.
 *
 * Defining them once here keeps a single chunk per component and identical
 * loading behaviour on every page that uses it.
 */

import dynamic from "next/dynamic";
import { ModalLoadingFallback, PanelLoadingFallback } from "@/components/ui/lazy-overlay";

const modalLoading = () => <ModalLoadingFallback />;

export const LazyAddExpenseDialog = dynamic(
  () => import("@/components/expenses/add-expense-dialog").then((m) => m.AddExpenseDialog),
  { ssr: false, loading: modalLoading }
);

export const LazyInviteMemberModal = dynamic(
  () => import("@/components/groups/InviteMemberModal").then((m) => m.InviteMemberModal),
  { ssr: false, loading: modalLoading }
);

export const LazyExportGroupModal = dynamic(
  () => import("@/components/modals/ExportGroupModal").then((m) => m.ExportGroupModal),
  { ssr: false, loading: modalLoading }
);

export const LazyCreateGroupDialog = dynamic(
  () => import("@/components/groups/create-group-dialog").then((m) => m.CreateGroupDialog),
  { ssr: false, loading: modalLoading }
);

export const LazyJoinGroupDialog = dynamic(
  () => import("@/components/groups/join-group-dialog").then((m) => m.JoinGroupDialog),
  { ssr: false, loading: modalLoading }
);

export const LazySep24Modal = dynamic(
  () => import("@/components/anchors/Sep24Modal").then((m) => m.Sep24Modal),
  { ssr: false, loading: modalLoading }
);

export const LazyAnchorInteractiveModal = dynamic(
  () => import("@/components/AnchorInteractiveModal").then((m) => m.AnchorInteractiveModal),
  { ssr: false, loading: modalLoading }
);

export const LazyGroupQRScannerModal = dynamic(
  () =>
    import("@/components/groups/GroupQRScannerModal").then((m) => m.GroupQRScannerModal),
  { ssr: false, loading: modalLoading }
);

/** Only rendered for treasury-enabled groups; reserves its height while loading. */
export const LazyTreasuryView = dynamic(
  () => import("@/components/treasury/TreasuryView").then((m) => m.TreasuryView),
  { ssr: false, loading: () => <PanelLoadingFallback minHeightClass="min-h-[18rem]" label="Loading treasury…" /> }
);
