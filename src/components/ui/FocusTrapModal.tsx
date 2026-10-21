"use client";

import React, { useRef } from "react";
import { useDialogFocus } from "./useDialogFocus";

export function FocusTrapModal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useDialogFocus({ open: true, onClose, panelRef: modalRef, contentRef });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Dialog"
        className="bg-white p-6 rounded outline-none"
        tabIndex={-1}
      >
        <div ref={contentRef}>{children}</div>
      </div>
    </div>
  );
}
