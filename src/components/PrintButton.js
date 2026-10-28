'use client';

export default function PrintButton({ label = 'Print' }) {
  return <button type="button" onClick={() => window.print()} className="btn-secondary no-print">{label}</button>;
}
