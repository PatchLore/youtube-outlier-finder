"use client";

import { useState, useCallback } from "react";
import { UpgradeModal } from "@/app/components/modals/UpgradeModal";

export type UpgradeModalOptions = {
  title: string;
  description: string;
  features: string[];
};

/**
 * Hook to control the Pro upgrade modal. Use with fetchVideos(..., { on403: () => showUpgradeModal(...) }).
 * Renders nothing; parent must render <UpgradeModal /> or use the returned component.
 */
export function useUpgradeModal() {
  const [modal, setModal] = useState<UpgradeModalOptions | null>(null);

  const showUpgradeModal = useCallback((opts: UpgradeModalOptions) => {
    setModal(opts);
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
  }, []);

  const UpgradeModalNode = modal ? (
    <UpgradeModal
      isOpen={true}
      onClose={closeModal}
      title={modal.title}
      description={modal.description}
      features={modal.features}
    />
  ) : null;

  return { showUpgradeModal, closeModal, UpgradeModalNode };
}
