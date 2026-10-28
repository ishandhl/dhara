import { fmtDateTime } from '@/lib/dates';
import { qty } from '@/lib/format';
import { cancelStoreMovement } from '@/app/(app)/general-store/actions';
import { Empty } from './ui';

const TYPE_LABEL = {
  OPENING: ['Opening', 'bg-slate-200 text-slate-700'],
  RECEIPT: ['Received', 'bg-emerald-100 text-emerald-800'],
  ISSUE: ['Issued', 'bg-amber-100 text-amber-800'],
  COUNT_ADJ: ['Count adj.', 'bg-blue-100 text-blue-800'],
};

export default function StoreMovements({ moves, manager, back, showItem }) {
  return (
    <>
      <table className="table">
        <thead><tr><th>When</th>{showItem && <th>Item</th>}<th>Type</th><th className="num">Qty</th><th>Supplier / dept.</th><th>Note</th>{manager && <th></th>}</tr></thead>
        <tbody>
          {moves.map((m) => (
            <tr key={m.id} className={m.cancelled ? 'text-slate-400 line-through' : ''}>
              <td className="whitespace-nowrap text-xs">{fmtDateTime(m.createdAt)}</td>
              {showItem && <td>{m.packagingItem.name}</td>}
              <td><span className={`badge ${TYPE_LABEL[m.type]?.[1] || 'bg-slate-100'}`}>{m.refType === 'BatchPackaging' || m.refType === 'BatchIngredient' ? 'Used in batch' : TYPE_LABEL[m.type]?.[0] || m.type}</span></td>
              <td className={`num ${m.qty < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{m.qty > 0 ? '+' : ''}{qty(m.qty)}</td>
              <td className="text-xs">{m.party}</td>
              <td className="text-xs text-slate-500">{m.note}</td>
              {manager && (
                <td className="text-right">
                  {!m.cancelled && !m.refType && (
                    <form action={cancelStoreMovement.bind(null, m.id)} className="flex justify-end gap-1">
                      <input type="hidden" name="back" value={back} />
                      <input name="reason" placeholder="Reason" className="input w-24 py-1 text-xs" required />
                      <button className="text-xs text-red-600 hover:underline">Cancel</button>
                    </form>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {moves.length === 0 && <Empty>No movements.</Empty>}
    </>
  );
}
