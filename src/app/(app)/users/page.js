import Link from 'next/link';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireView, requireEdit } from '@/lib/auth';
import { ROLES, ROLE_LABELS } from '@/lib/roles';
import { audit } from '@/lib/audit';
import { run, reqStr, str, UserError } from '@/lib/forms';
import { Flash, PageHeader, Field } from '@/components/ui';
import { fmtDateTime } from '@/lib/dates';

async function saveUser(formData) {
  'use server';
  await run('/users', async () => {
    const admin = await requireEdit('users');
    const id = parseInt(formData.get('id'), 10);
    const name = reqStr(formData, 'name', 'Name');
    const username = reqStr(formData, 'username', 'Username').toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new UserError('Username: 3–30 letters, numbers, dot, dash or underscore');
    const role = str(formData, 'role');
    if (!ROLES.includes(role)) throw new UserError('Pick a role');
    const active = formData.get('active') === 'on';
    const password = str(formData, 'password');
    if (!id && password.length < 6) throw new UserError('Password must be at least 6 characters');
    if (id && password && password.length < 6) throw new UserError('Password must be at least 6 characters');
    if (id === admin.id && (!active || role !== 'ADMIN')) throw new UserError('You cannot remove your own admin access');
    const data = { name, username, role, active };
    if (password) data.passwordHash = await bcrypt.hash(password, 10);
    if (id) {
      const before = await prisma.user.findUnique({ where: { id }, select: { name: true, username: true, role: true, active: true } });
      await prisma.user.update({ where: { id }, data });
      await audit({ userId: admin.id, action: 'UPDATE', entity: 'User', entityId: id, before, after: { name, username, role, active, passwordChanged: !!password } });
    } else {
      const u = await prisma.user.create({ data });
      await audit({ userId: admin.id, action: 'CREATE', entity: 'User', entityId: u.id, after: { name, username, role, active } });
    }
    revalidatePath('/users');
    return '/users?ok=Saved';
  });
}

export default async function UsersPage({ searchParams }) {
  const sp = await searchParams;
  await requireView('users');
  const users = await prisma.user.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  const editId = sp?.edit ? parseInt(sp.edit, 10) : null;
  const editing = users.find((u) => u.id === editId);
  return (
    <div>
      <PageHeader title="Users" subtitle="Each staff member logs in with their own username. Deactivate people who leave; never share logins." />
      <Flash sp={sp} />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="card overflow-x-auto xl:col-span-2">
          <table className="table">
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td>
                  <td>{u.username}</td>
                  <td>{ROLE_LABELS[u.role]}</td>
                  <td>{u.active ? <span className="badge bg-emerald-100 text-emerald-800">Active</span> : <span className="badge bg-slate-200 text-slate-600">Inactive</span>}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(u.createdAt)}</td>
                  <td className="text-right"><Link href={`/users?edit=${u.id}`} className="text-brand-600 hover:underline">Edit</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={saveUser} className="card card-pad h-fit space-y-3" key={editing?.id || 'new'}>
          <div className="flex items-center justify-between">
            <h2 className="h2">{editing ? 'Edit user' : 'Add user'}</h2>
            {editing && <Link href="/users" className="text-sm text-slate-500 hover:underline">Cancel</Link>}
          </div>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Full name *"><input name="name" defaultValue={editing?.name} className="input" required /></Field>
          <Field label="Username *"><input name="username" defaultValue={editing?.username} className="input" required /></Field>
          <Field label="Role *">
            <select name="role" defaultValue={editing?.role || 'QC'} className="input">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </Field>
          <Field label={editing ? 'New password (leave blank to keep)' : 'Password *'}><input name="password" type="password" className="input" autoComplete="new-password" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={editing ? editing.active : true} className="h-4 w-4" /> Active</label>
          <button className="btn-primary w-full">{editing ? 'Save changes' : 'Add user'}</button>
        </form>
      </div>
    </div>
  );
}
