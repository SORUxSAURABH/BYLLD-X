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
  broadcast: {
    id: "bc-1",
    message: "🚀 Platform Update: 35+ new verified angel investors and VCs joined the network this week!",
    type: "info",
    active: true,
    createdAt: new Date().toISOString(),
  },
  featuredIdeaIds: ["idea-seed-1", "idea-fintech-2"],
  mockUsers: [
    {
      id: "usr-founder-1",
      email: "arjun.m@byllx.in",
      fullName: "Arjun Mehta",
      role: "founder",
      isPremium: true,
      accountStatus: "active",
      createdAt: "2026-08-15T10:00:00.000Z",
    },
    {
      id: "usr-investor-1",
      email: "neha.kapoor@venturecap.in",
      fullName: "Neha Kapoor",
      role: "investor",
      isPremium: true,
      accountStatus: "active",
      createdAt: "2026-08-18T14:30:00.000Z",
    },
    {
      id: "usr-founder-2",
      email: "sara.m@greenwatts.in",
      fullName: "Sara Menon",
      role: "founder",
      isPremium: false,
      accountStatus: "active",
      createdAt: "2026-08-22T09:15:00.000Z",
    },
    {
      id: "usr-investor-2",
      email: "ananya.shah@bluestar.in",
      fullName: "Ananya Shah",
      role: "investor",
      isPremium: true,
      accountStatus: "active",
      createdAt: "2026-08-25T11:45:00.000Z",
    },
    {
      id: "usr-founder-3",
      email: "rohan.v@omni-robotics.in",
      fullName: "Rohan Verma",
      role: "founder",
      isPremium: false,
      accountStatus: "active",
      createdAt: "2026-08-29T16:20:00.000Z",
    },
    {
      id: "usr-investor-3",
      email: "kunal.b@angelcapital.in",
      fullName: "Kunal Bahl",
      role: "investor",
      isPremium: false,
      accountStatus: "active",
      createdAt: "2026-09-01T12:00:00.000Z",
    },
  ],
};

if (process.env.NODE_ENV !== "production") {
  globalForAdmin.adminStore = adminStore;
}
