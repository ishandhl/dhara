export const ROLES = ['ADMIN', 'MANAGER', 'QC', 'PRODUCTION', 'STORE', 'DISPATCH', 'ACCOUNTS'];

export const ROLE_LABELS = {
  ADMIN: 'Owner / Admin',
  MANAGER: 'Plant Manager',
  QC: 'Receiving / QC',
  PRODUCTION: 'Production Supervisor',
  STORE: 'Store Keeper',
  DISPATCH: 'Dispatch Officer',
  ACCOUNTS: 'Accounts (view only)',
};

// Which roles can VIEW / ENTER data in each section.
export const ACCESS = {
  dashboard: { view: ROLES, edit: [] },
  receiving: { view: ['ADMIN', 'MANAGER', 'QC', 'PRODUCTION', 'ACCOUNTS'], edit: ['ADMIN', 'MANAGER', 'QC'] },
  silos: { view: ['ADMIN', 'MANAGER', 'QC', 'PRODUCTION'], edit: ['ADMIN', 'MANAGER', 'QC', 'PRODUCTION'] },
  production: { view: ['ADMIN', 'MANAGER', 'PRODUCTION', 'STORE'], edit: ['ADMIN', 'MANAGER', 'PRODUCTION'] },
  store: { view: ['ADMIN', 'MANAGER', 'STORE', 'DISPATCH', 'PRODUCTION', 'ACCOUNTS'], edit: ['ADMIN', 'MANAGER', 'STORE'] },
  dispatch: { view: ['ADMIN', 'MANAGER', 'STORE', 'DISPATCH', 'ACCOUNTS'], edit: ['ADMIN', 'MANAGER', 'STORE', 'DISPATCH'] },
  generalStore: { view: ['ADMIN', 'MANAGER', 'STORE', 'PRODUCTION', 'ACCOUNTS'], edit: ['ADMIN', 'MANAGER', 'STORE'] },
  reports: { view: ['ADMIN', 'MANAGER', 'STORE', 'DISPATCH', 'ACCOUNTS'], edit: [] },
  masters: { view: ['ADMIN', 'MANAGER'], edit: ['ADMIN', 'MANAGER'] },
  users: { view: ['ADMIN'], edit: ['ADMIN'] },
  audit: { view: ['ADMIN', 'MANAGER'], edit: [] },
  backups: { view: ['ADMIN', 'MANAGER'], edit: [] },
  // Corrections after approval (cancel receipt / batch)
  approve: { view: ['ADMIN', 'MANAGER'], edit: ['ADMIN', 'MANAGER'] },
};

export function canView(role, section) {
  return !!ACCESS[section]?.view.includes(role);
}
export function canEdit(role, section) {
  return !!ACCESS[section]?.edit.includes(role);
}
