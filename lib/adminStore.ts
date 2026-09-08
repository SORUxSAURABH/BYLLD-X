/**
 * In-memory / persistent admin state store for BYLLD X
 */

export interface BroadcastMessage {
  id: string;
  message: string;
  type: "info" | "warning" | "success" | "alert";
  active: boolean;
  createdAt: string;
}

export interface AdminStore {
  broadcast: BroadcastMessage | null;
  featuredIdeaIds: string[];
  mockUsers: Array<{
    id: string;
    email: string;
    fullName: string;
    role: "founder" | "investor";
    isPremium: boolean;
    accountStatus: "active" | "suspended" | "banned";
    createdAt: string;
  }>;
}

// Global singleton across API invocations in development/runtime
const globalForAdmin = global as unknown as { adminStore?: AdminStore };

export const adminStore: AdminStore = globalForAdmin.adminStore || {
  broadcast: null,
  featuredIdeaIds: [],
  mockUsers: [],
};

if (process.env.NODE_ENV !== "production") {
  globalForAdmin.adminStore = adminStore;
}
