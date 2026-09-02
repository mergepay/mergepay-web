/**
 * SEP-24 anchor info helpers for the deposit / withdrawal modal flow.
 *
 * `useAnchorInfo` fetches the anchor catalogue via React Query and narrows it
 * to the anchors that support a given asset code; `findAnchorForAsset` is the
 * pure selection logic, kept separate so it is trivially unit-testable.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { AnchorInfo } from "./types";

/** Whether an anchor advertises support for the given asset code. */
export function anchorSupportsAsset(
  anchor: AnchorInfo,
  assetCode: string
): boolean {
  const wanted = assetCode.trim().toUpperCase();
  return anchor.assets.some(
    (asset) => asset.code.trim().toUpperCase() === wanted
  );
}

/**
 * Find the first anchor supporting `assetCode`, preferring a named anchor when
 * provided. Returns `null` when no anchor advertises the asset.
 */
export function findAnchorForAsset(
  anchors: AnchorInfo[],
  assetCode: string,
  preferredName?: string | null
): AnchorInfo | null {
  if (preferredName) {
    const named = anchors.find(
      (a) =>
        a.name.trim().toLowerCase() === preferredName.trim().toLowerCase() &&
        anchorSupportsAsset(a, assetCode)
    );
    if (named) return named;
  }
  return anchors.find((a) => anchorSupportsAsset(a, assetCode)) ?? null;
}

export interface UseAnchorInfoResult {
  /** Anchors that support the requested asset. */
  anchors: AnchorInfo[];
  /** Whether the catalogue is still loading. */
  isLoading: boolean;
  /** Whether fetching the catalogue failed. */
  isError: boolean;
  /** Retry the catalogue fetch. */
  refetch: () => void;
}

/**
 * Fetch the SEP-24 anchor catalogue and return the anchors supporting
 * `assetCode`. Reused by the AnchorModal to drive its anchor picker.
 */
export function useAnchorInfo(assetCode: string): UseAnchorInfoResult {
  const query = useQuery({
    queryKey: ["anchors", "info", assetCode],
    queryFn: api.listAnchors,
    enabled: Boolean(assetCode),
  });

  const allAnchors = query.data?.anchors ?? [];
  const anchors = assetCode
    ? allAnchors.filter((anchor) => anchorSupportsAsset(anchor, assetCode))
    : allAnchors;

  return {
    anchors,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
