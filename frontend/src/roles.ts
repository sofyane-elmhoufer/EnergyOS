// Profils et statuts des dossiers, partagés par les pages.

export type Role = "guest" | "client" | "commercial" | "technicien" | "admin";

export type User = {
  id: number;
  email: string;
  name: string;
  role: Exclude<Role, "guest">;
  phone: string;
  company: string;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
};

export const ROLE_LABELS: Record<Role, string> = {
  guest: "Invité",
  client: "Client",
  commercial: "Commercial",
  technicien: "Technicien",
  admin: "Administrateur",
};

export const PROJECT_STATUS: Record<string, { label: string; className: string }> = {
  new: { label: "Nouveau", className: "bg-blue-50 text-blue-700" },
  contacted: { label: "Contacté", className: "bg-violet-50 text-violet-700" },
  won: { label: "Accepté", className: "bg-emerald-50 text-emerald-700" },
  lost: { label: "Perdu", className: "bg-gray-100 text-gray-600" },
  scheduled: { label: "Installation planifiée", className: "bg-amber-50 text-amber-800" },
  installed: { label: "Installé", className: "bg-emerald-100 text-emerald-800" },
};
