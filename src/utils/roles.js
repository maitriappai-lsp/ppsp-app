// Roles: "Admin", "Facilitator", and "Audit Facilitator". An Audit Facilitator
// can do everything a Facilitator can, plus record audit visits, so most code
// asks isFacilitatorRole() ("is this a field resource?") and only the Audit tab
// asks isAuditFacilitator().
export const ROLES = ['Facilitator', 'Audit Facilitator', 'Admin'];

export const isFacilitatorRole = (role) => role === 'Facilitator' || role === 'Audit Facilitator';

export const isAuditFacilitator = (role) => role === 'Audit Facilitator';
