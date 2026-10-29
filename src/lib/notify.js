// Low-stock reminders for the general store, sent to phones every day at 17:00 (Nepal) by
// .github/workflows/stock-alerts.yml, or on demand from Setup → Tolerances & Settings.
//   • Phone notification: ntfy (free app, no account) — anyone who knows the topic name receives it.
//   • WhatsApp: CallMeBot (free for personal use; the API key comes from the bot on WhatsApp).
import { prisma } from './db';
import { todayISO, bs } from './dates';
import { storeItemStocks } from './stock';
import { qty } from './format';
import { BRAND } from './brand';

export const NOTIFY_KEYS = { topic: 'NOTIFY_NTFY_TOPIC', phone: 'NOTIFY_WA_PHONE', apikey: 'NOTIFY_WA_APIKEY' };

export async function getNotifySettings() {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(NOTIFY_KEYS) } } });
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { topic: v[NOTIFY_KEYS.topic] || '', phone: v[NOTIFY_KEYS.phone] || '', apikey: v[NOTIFY_KEYS.apikey] || '' };
}

/**
 * Items to remind about: out of stock (0 or less) and low (at or below the reorder level).
 * Only items that have had stock entered at least once count, so items never used here stay quiet.
 */
export async function lowStockItems() {
  const [items, stocks] = await Promise.all([prisma.packagingItem.findMany({ where: { active: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }), storeItemStocks()]);
  const out = [];
  const low = [];
  for (const i of items) {
    if (!(i.id in stocks)) continue;
    const s = stocks[i.id];
    if (s <= 0) out.push({ ...i, stock: s });
    else if (i.reorderLevel !== null && s <= i.reorderLevel) low.push({ ...i, stock: s });
  }
  return { out, low };
}

export function stockMessage({ out, low }) {
  const lines = [`${BRAND.name} · General store · ${bs(todayISO())}`];
  if (out.length) {
    lines.push('', `OUT OF STOCK (${out.length}):`);
    for (const i of out) lines.push(`• ${i.name}`);
  }
  if (low.length) {
    lines.push('', `LOW STOCK (${low.length}):`);
    for (const i of low) lines.push(`• ${i.name}: ${qty(i.stock)} ${i.unit} (reorder at ${qty(i.reorderLevel)})`);
  }
  return lines.join('\n');
}

const siteUrl = () => (process.env.URL || 'https://fluidcanvas.net').replace(/\/$/, '');

async function sendNtfy(topic, title, text, urgent) {
  const r = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: 'POST',
    body: text,
    headers: { Title: title, Priority: urgent ? 'high' : 'default', Tags: urgent ? 'rotating_light' : 'warning', Click: `${siteUrl()}/general-store?low=1` },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`ntfy answered ${r.status}`);
}

async function sendWhatsApp(phone, apikey, text) {
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&apikey=${encodeURIComponent(apikey)}&text=${encodeURIComponent(text)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const body = await r.text();
  if (!r.ok || /error|invalid|not valid/i.test(body.replace(/<[^>]+>/g, ' ').slice(0, 400))) throw new Error(`CallMeBot: ${body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || r.status}`);
}

/**
 * Check stock and send the reminder to every channel that is set up.
 * `force` sends even when nothing is low (used by the "Send test" button).
 * Returns { sent: [...channels], skipped, errors: [...], out, low }.
 */
export async function sendStockReminder({ force = false } = {}) {
  const [s, items] = await Promise.all([getNotifySettings(), lowStockItems()]);
  const result = { sent: [], errors: [], out: items.out.length, low: items.low.length, skipped: false };
  const nothing = !items.out.length && !items.low.length;
  if (nothing && !force) return { ...result, skipped: true };
  const text = nothing ? `${BRAND.name} · General store · ${bs(todayISO())}\n\nAll items are above their reorder level. (Test message)` : stockMessage(items);
  const title = nothing ? 'Stock reminder test' : `${items.out.length ? `${items.out.length} out of stock` : ''}${items.out.length && items.low.length ? ', ' : ''}${items.low.length ? `${items.low.length} low` : ''} - general store`;
  const tasks = [];
  if (s.topic) tasks.push(['Phone notification', () => sendNtfy(s.topic, title, text, items.out.length > 0)]);
  if (s.phone && s.apikey) tasks.push(['WhatsApp', () => sendWhatsApp(s.phone, s.apikey, text)]);
  if (!tasks.length) return { ...result, skipped: true, notSetUp: true, errors: force ? ['No phone or WhatsApp is set up yet — save the reminder settings first'] : [] };
  for (const [name, fn] of tasks) {
    try { await fn(); result.sent.push(name); } catch (e) { result.errors.push(`${name}: ${e.message}`); }
  }
  return result;
}
