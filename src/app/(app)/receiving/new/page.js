import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { todayISO } from '@/lib/dates';
import { getSnfFormula } from '@/lib/tolerance';
import { createReceipt } from '../actions';
import { Flash, PageHeader } from '@/components/ui';
import QcEntryForm from '@/components/QcEntryForm';

export default async function NewReceipt({ searchParams }) {
  const sp = await searchParams;
  await requireView('receiving');
  const [suppliers, tankers, formula] = await Promise.all([
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.tanker.findMany({ where: { active: true }, orderBy: { number: 'asc' }, include: { supplier: true } }),
    getSnfFormula(),
  ]);
  return (
    <div className="max-w-4xl">
      <PageHeader title="Milk QC entry" subtitle="Arrival and QC test in one go." actions={<Link href="/receiving" className="btn-secondary">Back to list</Link>} />
      <Flash sp={sp} />
      <QcEntryForm key={sp?.ok || 'new'} action={createReceipt} suppliers={suppliers} tankers={tankers} today={todayISO()} formula={formula} />
    </div>
  );
}
