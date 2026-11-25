"use client";

import { Sep24Modal } from "@/components/anchor/Sep24Modal";
import type { Sep24ModalProps } from "@/components/anchor/Sep24Modal";

export type AnchorModalProps = Omit<Sep24ModalProps, "assetCode"> & {
  assetCode: string;
};

export function AnchorModal(props: AnchorModalProps) {
  return <Sep24Modal {...props} />;
}