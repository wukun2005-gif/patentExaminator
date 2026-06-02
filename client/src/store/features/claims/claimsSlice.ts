import { create } from "zustand";
import type { ClaimNode, ClaimFeature } from "@shared/types/domain";
import {
  createClaimNode,
  deleteClaimNode,
  createClaimFeature,
  updateClaimFeature,
  deleteClaimFeature,
  deleteClaimFeaturesByCaseId
} from "../../../lib/repos.js";
import { saveRunMarker } from "../../../lib/repos.js";
import { createLogger } from "../../../lib/logger";

const log = createLogger("ClaimsSlice");

export interface ClaimsSlice {
  claimNodes: ClaimNode[];
  claimFeatures: ClaimFeature[];
  isLoading: boolean;
  ranCases: string[];

  setClaimNodes: (nodes: ClaimNode[]) => void;
  addClaimNode: (node: ClaimNode) => void;
  removeClaimNode: (id: string) => void;
  setClaimFeatures: (features: ClaimFeature[], caseId?: string) => void;
  addClaimFeature: (feature: ClaimFeature) => void;
  updateClaimFeature: (feature: ClaimFeature) => void;
  removeClaimFeature: (id: string) => void;
  loadClaimFeatures: (features: ClaimFeature[]) => void; // for loading from DB without re-saving
  clearClaimFeatures: (caseId: string) => void;
  setLoading: (v: boolean) => void;
  setRanCases: (caseIds: string[]) => void;
  addRanCase: (caseId: string) => void;
}

export const createClaimsSlice = (
  set: (fn: (prev: ClaimsSlice) => Partial<ClaimsSlice>) => void,
  _get: () => ClaimsSlice
): ClaimsSlice => ({
  claimNodes: [],
  claimFeatures: [],
  isLoading: false,
  ranCases: [],

  setClaimNodes: (claimNodes) => set(() => ({ claimNodes })),

  addClaimNode: (node) => {
    set((prev) => ({ claimNodes: [...prev.claimNodes, node] }));
    // Persist to IndexedDB (async, fire-and-forget)
    createClaimNode(node).catch((err) => {
      log(`Failed to save claim node ${node.id}:`, err);
    });
  },

  removeClaimNode: (id) => {
    set((prev) => ({ claimNodes: prev.claimNodes.filter((n) => n.id !== id) }));
    // Delete from IndexedDB (async, fire-and-forget)
    deleteClaimNode(id).catch((err) => {
      log(`Failed to delete claim node ${id}:`, err);
    });
  },

  setClaimFeatures: (claimFeatures, caseId) => {
    set(() => ({ claimFeatures }));
    // Persist to IndexedDB (async, fire-and-forget)
    // First clear existing features for this case, then save new ones
    if (caseId) {
      deleteClaimFeaturesByCaseId(caseId)
        .then(() => {
          for (const feature of claimFeatures) {
            createClaimFeature(feature).catch((err) => {
              log(`Failed to save claim feature ${feature.id}:`, err);
            });
          }
        })
        .catch((err) => {
          log(`Failed to clear claim features for case ${caseId}:`, err);
        });
    }
  },

  addClaimFeature: (feature) => {
    set((prev) => ({ claimFeatures: [...prev.claimFeatures, feature] }));
    // Persist to IndexedDB (async, fire-and-forget)
    createClaimFeature(feature).catch((err) => {
      log(`Failed to save claim feature ${feature.id}:`, err);
    });
  },

  updateClaimFeature: (feature) => {
    set((prev) => ({
      claimFeatures: prev.claimFeatures.map((f) => (f.id === feature.id ? feature : f))
    }));
    // Persist to IndexedDB (async, fire-and-forget)
    updateClaimFeature(feature).catch((err) => {
      log(`Failed to update claim feature ${feature.id}:`, err);
    });
  },

  removeClaimFeature: (id) => {
    set((prev) => ({ claimFeatures: prev.claimFeatures.filter((f) => f.id !== id) }));
    // Delete from IndexedDB (async, fire-and-forget)
    deleteClaimFeature(id).catch((err) => {
      log(`Failed to delete claim feature ${id}:`, err);
    });
  },

  loadClaimFeatures: (features) => set(() => ({ claimFeatures: features })),

  clearClaimFeatures: (caseId) => {
    set((prev) => ({ claimFeatures: prev.claimFeatures.filter((f) => !f.id.startsWith(caseId)) }));
    // Delete from IndexedDB (async, fire-and-forget)
    deleteClaimFeaturesByCaseId(caseId).catch((err) => {
      log(`Failed to clear claim features for case ${caseId}:`, err);
    });
  },

  setLoading: (v) => set(() => ({ isLoading: v })),
  setRanCases: (caseIds) => set(() => ({ ranCases: caseIds })),
  addRanCase: (caseId) => {
    saveRunMarker(caseId, "claimChart").catch((e) => log("[ClaimsSlice] saveRunMarker error:", e));
    set((prev) => ({
      ranCases: prev.ranCases.includes(caseId) ? prev.ranCases : [...prev.ranCases, caseId]
    }));
  }
});

export const useClaimsStore = create<ClaimsSlice>()((set, get) => createClaimsSlice(set, get));