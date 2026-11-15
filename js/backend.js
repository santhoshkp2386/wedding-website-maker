// Supabase backend for RSVPs and wishes. The publishable key is safe to ship in the browser:
// tables are locked down and only the functions in supabase/schema.sql are callable.
export const SUPABASE_URL = 'https://omiiausahrmbaiygixvj.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_of8kyHfbJp4GYoio8ErXkQ_BszTghDN';

export async function rpc(fn, args = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const txt = await r.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!r.ok) {
    const msg = data?.message || `Request failed (${r.status})`;
    const e = new Error(/Could not find the function|schema cache/i.test(msg)
      ? 'The RSVP database is not set up yet (run supabase/schema.sql).' : msg);
    e.status = r.status;
    throw e;
  }
  return data;
}

export const createWedding = title => rpc('create_wedding', { p_title: title });
export const submitRsvp = (wedding, r) => rpc('submit_rsvp', {
  p_wedding: wedding, p_name: r.name, p_invite: r.invite || '', p_attending: r.attending,
  p_guests: r.guests, p_events: r.events || [], p_message: r.message || '',
});
export const addWish = (wedding, name, message) => rpc('add_wish', { p_wedding: wedding, p_name: name, p_message: message });
export const listWishes = wedding => rpc('list_wishes', { p_wedding: wedding });
export const adminData = (wedding, key) => rpc('admin_data', { p_wedding: wedding, p_key: key });
export const setWishHidden = (wedding, key, id, hidden) => rpc('admin_set_wish_hidden', { p_wedding: wedding, p_key: key, p_id: id, p_hidden: hidden });
export const deleteRsvp = (wedding, key, id) => rpc('admin_delete_rsvp', { p_wedding: wedding, p_key: key, p_id: id });
