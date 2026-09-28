import React, { useEffect, useRef } from 'react';

export function FocusTrapModal({ children, onClose }: { children: React.ReactNode, onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50">
      <div ref={modalRef} className="bg-white p-6 rounded" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
