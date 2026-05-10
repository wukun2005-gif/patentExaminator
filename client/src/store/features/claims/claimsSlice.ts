import { create } from "zustand";
import type { ClaimNode, ClaimFeature } from "@shared/types/domain";

export interface ClaimsSlice {
  claimNodes: ClaimNode[];
  claimFeatures: ClaimFeature[];
  isLoading: boolean;

  setClaimNodes: (nodes: ClaimNode[]) => void;
  addClaimNode: (node: ClaimNode) => void;
  removeClaimNode: (id: string) => void;
  setClaimFeatures: (features: ClaimFeature[]) => void;
  addClaimFeature: (feature: ClaimFeature) => void;
  updateClaimFeature: (feature: ClaimFeature) => void;
  removeClaimFeature: (id: string) => void;
  setLoading: (v: boolean) => void;
}

export const createClaimsSlice = (
  set: (fn: (prev: ClaimsSlice) => Partial<ClaimsSlice>) => void,
  _get: () => ClaimsSlice
): ClaimsSlice => ({
  claimNodes: [],
  claimFeatures: [],
  isLoading: false,

  setClaimNodes: (claimNodes) => set(() => ({ claimNodes })),
  addClaimNode: (node) => set((prev) => ({ claimNodes: [...prev.claimNodes, node] })),
  removeClaimNode: (id) =>
    set((prev) => ({ claimNodes: prev.claimNodes.filter((n) => n.id !== id) })),
  setClaimFeatures: (claimFeatures) => set(() => ({ claimFeatures })),
  addClaimFeature: (feature) =>
    set((prev) => ({ claimFeatures: [...prev.claimFeatures, feature] })),
  updateClaimFeature: (feature) =>
    set((prev) => ({
      claimFeatures: prev.claimFeatures.map((f) => (f.id === feature.id ? feature : f))
    })),
  removeClaimFeature: (id) =>
    set((prev) => ({ claimFeatures: prev.claimFeatures.filter((f) => f.id !== id) })),
  setLoading: (v) => set(() => ({ isLoading: v }))
});

export const useClaimsStore = create<ClaimsSlice>()((set, get) => createClaimsSlice(set, get));
