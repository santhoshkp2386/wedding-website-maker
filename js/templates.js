// Templates, element (section) definitions and the default project.
export const uid = () => Math.random().toString(36).slice(2, 10);

export const HERO_STYLES = [
  ['carousel', '3D photo carousel'],
  ['portrait', 'Arched 3D portrait (photo slideshow)'],
  ['rings', 'Interlocking gold rings'],
  ['frames', 'Fly-through floating frames'],
  ['heart', 'Particle heart'],
  ['none', 'None (text only)'],
];

export const BACKGROUNDS = [
  ['radial', 'Radial glow'],
  ['gradient', 'Soft gradient'],
  ['aurora', 'Animated aurora'],
  ['plain', 'Plain colour'],
];

export const EFFECTS = [
  { id: 'petals', label: 'Rose petals', icon: '🌸' },
  { id: 'sparkles', label: 'Sparkles', icon: '✨' },
  { id: 'hearts', label: 'Floating hearts', icon: '💕' },
  { id: 'fireflies', label: 'Fireflies', icon: '🪔' },
  { id: 'lanterns', label: 'Sky lanterns', icon: '🏮' },
  { id: 'bokeh', label: 'Bokeh lights', icon: '🔆' },
  { id: 'snow', label: 'Snowfall', icon: '❄️' },
  { id: 'confetti', label: 'Confetti', icon: '🎊' },
  { id: 'stars', label: 'Starfield', icon: '🌌' },
];

export const TEMPLATES = [
  {
    id: 'royal', name: 'Royal Gold', desc: 'Regal gold & maroon, 3D rings',
    colors: { bg: '#140d08', primary: '#d4af37', accent: '#8c2a3c', text: '#f8ecd4' },
    fonts: { display: 'Cinzel', body: 'Cormorant Garamond' },
    scene: { hero: 'rings', background: 'radial' }, effects: ['sparkles', 'petals'],
  },
  {
    id: 'festive', name: 'Shubh Vivah', desc: 'Marigold & emerald, lanterns',
    colors: { bg: '#10301f', primary: '#f4c430', accent: '#ff6b35', text: '#fff8e1' },
    fonts: { display: 'Kaushan Script', body: 'Mukta' },
    scene: { hero: 'portrait', background: 'radial' }, effects: ['lanterns', 'petals'],
  },
  {
    id: 'blush', name: 'Blush Garden', desc: 'Soft florals, photo carousel',
    colors: { bg: '#fff4f1', primary: '#c46b7a', accent: '#86a17a', text: '#4a2a31' },
    fonts: { display: 'Great Vibes', body: 'Lora' },
    scene: { hero: 'carousel', background: 'gradient' }, effects: ['petals', 'bokeh'],
  },
  {
    id: 'midnight', name: 'Midnight Stars', desc: 'Starry night, particle heart',
    colors: { bg: '#0a0f24', primary: '#c8b6ff', accent: '#ffd6a5', text: '#eef0ff' },
    fonts: { display: 'Playfair Display', body: 'Raleway' },
    scene: { hero: 'heart', background: 'aurora' }, effects: ['stars', 'fireflies'],
  },
  {
    id: 'sunset', name: 'Beach Sunset', desc: 'Coral & teal, floating frames',
    colors: { bg: '#fff0e3', primary: '#e8735a', accent: '#2a9d8f', text: '#3b2a20' },
    fonts: { display: 'Dancing Script', body: 'Quicksand' },
    scene: { hero: 'frames', background: 'gradient' }, effects: ['bokeh', 'hearts'],
  },
  {
    id: 'minimal', name: 'Modern Minimal', desc: 'Editorial black & brass',
    colors: { bg: '#f7f5f2', primary: '#1d1d1d', accent: '#b08d57', text: '#1d1d1d' },
    fonts: { display: 'Italiana', body: 'Montserrat' },
    scene: { hero: 'frames', background: 'plain' }, effects: ['sparkles'],
  },
  {
    id: 'winter', name: 'Winter Wonderland', desc: 'Icy blue, falling snow',
    colors: { bg: '#eaf2f8', primary: '#4f74a0', accent: '#c9a227', text: '#1f2d3d' },
    fonts: { display: 'Parisienne', body: 'Nunito' },
    scene: { hero: 'carousel', background: 'gradient' }, effects: ['snow', 'sparkles'],
  },
  {
    id: 'celestial', name: 'Celestial', desc: 'Violet night, golden glow',
    colors: { bg: '#120a2a', primary: '#f0c987', accent: '#6c5ce7', text: '#f3eefe' },
    fonts: { display: 'Marcellus', body: 'Josefin Sans' },
    scene: { hero: 'carousel', background: 'aurora' }, effects: ['stars', 'sparkles'],
  },
];

const T = { k: 'title', label: 'Section title' };

export const SECTION_TYPES = {
  countdown: {
    label: 'Countdown', icon: '⏳', desc: 'Live timer to the big day',
    defaults: { title: 'Counting down to forever' }, fields: [T],
    note: 'Counts down to the date set in Details.',
  },
  story: {
    label: 'Our Story', icon: '📖', desc: 'Timeline of your journey',
    defaults: {
      title: 'Our Story', items: [
        { date: '2019', title: 'First hello', text: "We met at a friend's rooftop party and talked until sunrise." },
        { date: '2022', title: 'The adventures', text: 'Road trips, late-night chai and a hundred inside jokes.' },
        { date: '2026', title: 'The proposal', text: 'Under a sky full of stars — one knee, one question, and a very happy yes!' },
      ],
    },
    fields: [T],
    list: { k: 'items', label: 'Moments', one: 'moment', blank: { date: '', title: '', text: '' },
      item: [{ k: 'date', label: 'When' }, { k: 'title', label: 'Title' }, { k: 'text', label: 'Story', type: 'textarea' }] },
  },
  events: {
    label: 'Events', icon: '📅', desc: 'Ceremony, reception & more',
    defaults: {
      title: 'Wedding Events', items: [
        { id: 'ev1', name: 'Sangeet Night', date: '2027-02-13', time: '19:00', venue: 'The Palace Lawns', address: 'City Palace, Udaipur', note: 'Music, dance & celebration' },
        { id: 'ev2', name: 'Wedding Ceremony', date: '2027-02-14', time: '18:30', venue: 'Lake Pavilion', address: 'Lake Pichola, Udaipur', note: '' },
        { id: 'ev3', name: 'Reception', date: '2027-02-15', time: '20:00', venue: 'Grand Ballroom', address: 'Udaipur, Rajasthan', note: 'Dinner & dancing' },
      ],
    },
    fields: [T],
    list: { k: 'items', label: 'Events', one: 'event', blank: { name: '', date: '', time: '', venue: '', address: '', note: '' }, withId: true,
      item: [
        { k: 'name', label: 'Event name' }, { k: 'date', label: 'Date', type: 'date' }, { k: 'time', label: 'Time', type: 'time' },
        { k: 'venue', label: 'Venue' }, { k: 'address', label: 'Address (used for maps)' }, { k: 'note', label: 'Note', type: 'textarea', rows: 2 },
      ] },
  },
  gallery: {
    label: 'Photo Gallery', icon: '🖼️', desc: '3D carousel of your photos',
    defaults: { title: 'Moments Together', style: 'ring' },
    fields: [T, { k: 'style', label: 'Layout', type: 'select', options: [['ring', '3D spinning ring'], ['tilt', '3D tilt cards'], ['grid', 'Masonry grid']] }],
    note: 'Shows the photos marked “Gallery” in the Photos tab.',
  },
  map: {
    label: 'Venue Map', icon: '📍', desc: 'Embedded Google map',
    defaults: { title: 'Finding Us', venue: 'Lake Pavilion', address: 'Lake Pichola, Udaipur' },
    fields: [T, { k: 'venue', label: 'Venue name' }, { k: 'address', label: 'Address' }],
  },
  rsvp: {
    label: 'RSVP', icon: '💌', desc: 'Replies via WhatsApp, email or form',
    defaults: { title: 'Will you join us?', text: 'We would love to celebrate with you. Kindly reply by', deadline: '2027-01-15', method: 'online', target: '' },
    fields: [T, { k: 'text', label: 'Message', type: 'textarea', rows: 2 }, { k: 'deadline', label: 'Reply by', type: 'date' },
      { k: 'method', label: 'Send replies to', type: 'select', options: [['online', 'Online — saved to your Guests dashboard'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['link', 'External form (Google Forms etc.)']] },
      { k: 'target', label: 'Phone with country code / email / form URL (not needed for Online)', ph: '+91 98765 43210' }],
    note: 'Online replies appear in the Guests tab. Guests with a personal invite link see only their events and their name pre-filled.',
  },
  dresscode: {
    label: 'Dress Code', icon: '👗', desc: 'Attire & colour palette',
    defaults: { title: 'Dress Code', text: 'Festive traditional — think jewel tones and plenty of sparkle!', colors: '#8c2a3c, #d4af37, #1f4e5f' },
    fields: [T, { k: 'text', label: 'Description', type: 'textarea' }, { k: 'colors', label: 'Palette (comma-separated hex colours)' }],
  },
  quote: {
    label: 'Quote', icon: '❝', desc: 'A favourite line or verse',
    defaults: { text: 'Whatever our souls are made of, his and mine are the same.', author: 'Emily Brontë' },
    fields: [{ k: 'text', label: 'Quote', type: 'textarea' }, { k: 'author', label: 'Author' }],
  },
  video: {
    label: 'Video', icon: '🎬', desc: 'YouTube pre-wedding film',
    defaults: { title: 'Our Film', url: '' },
    fields: [T, { k: 'url', label: 'YouTube link', type: 'url', ph: 'https://youtu.be/…' }],
  },
  people: {
    label: 'Wedding Party', icon: '👨‍👩‍👧', desc: 'Family & friends',
    defaults: { title: 'Our Favourite People', items: [{ name: 'Rohan', role: 'Best Man' }, { name: 'Meera', role: 'Maid of Honour' }, { name: 'Kabir', role: 'Groomsman' }, { name: 'Anaya', role: 'Bridesmaid' }] },
    fields: [T],
    list: { k: 'items', label: 'People', one: 'person', blank: { name: '', role: '' }, item: [{ k: 'name', label: 'Name' }, { k: 'role', label: 'Role / relation' }] },
  },
  travel: {
    label: 'Travel & Stay', icon: '✈️', desc: 'Hotels, transport, tips',
    defaults: { title: 'Travel & Stay', text: 'Nearest airport: Maharana Pratap Airport (UDR).\nWe have reserved rooms at the Lakeside Hotel — mention our names for a special rate.' },
    fields: [T, { k: 'text', label: 'Details', type: 'textarea', rows: 5 }],
  },
  registry: {
    label: 'Gifts', icon: '🎁', desc: 'Registry or blessings note',
    defaults: { title: 'Gifts', text: 'Your presence is the greatest gift. If you wish to bless us, a contribution to our honeymoon fund would be cherished.', link: '', button: 'View registry' },
    fields: [T, { k: 'text', label: 'Message', type: 'textarea' }, { k: 'link', label: 'Link (optional)', type: 'url' }, { k: 'button', label: 'Button text' }],
  },
  faq: {
    label: 'FAQ', icon: '❓', desc: 'Answers for your guests',
    defaults: { title: 'Good to Know', items: [{ q: 'Can I bring a plus one?', a: 'Please check your invitation — space is limited.' }, { q: 'Is there parking?', a: 'Yes, free valet parking is available at all venues.' }] },
    fields: [T],
    list: { k: 'items', label: 'Questions', one: 'question', blank: { q: '', a: '' }, item: [{ k: 'q', label: 'Question' }, { k: 'a', label: 'Answer', type: 'textarea', rows: 2 }] },
  },
  wishes: {
    label: 'Guestbook', icon: '💬', desc: 'Guests leave wishes on a 3D wall',
    defaults: { title: 'Wishes & Blessings', text: 'Leave a note for the couple — it will appear on the wall below.' },
    fields: [T, { k: 'text', label: 'Intro line', type: 'textarea', rows: 2 }],
    note: 'Wishes are saved online. Hide any unwanted ones from the Guests tab.',
  },
  thanks: {
    label: 'Thank You', icon: '💖', desc: 'A closing note',
    defaults: { title: 'With Love', text: "Thank you for being part of our story. We can't wait to celebrate with you!" },
    fields: [T, { k: 'text', label: 'Message', type: 'textarea' }],
  },
};

export function newSection(type) {
  return { id: uid(), type, enabled: true, data: structuredClone(SECTION_TYPES[type].defaults) };
}

export function templateStyle(t) {
  return {
    template: t.id,
    colors: { ...t.colors },
    fonts: { ...t.fonts },
    scene: { hero: t.scene.hero, background: t.scene.background, motion: true },
    effects: Object.fromEntries(EFFECTS.map(e => [e.id, t.effects.includes(e.id)])),
  };
}

export function defaultConfig() {
  return {
    version: 1,
    couple: {
      partner1: 'Aarav', partner2: 'Diya', tagline: 'Together with their families',
      date: '2027-02-14T18:30', location: 'Udaipur, Rajasthan', hashtag: '#AaravWedsDiya',
    },
    ...templateStyle(TEMPLATES[0]),
    density: 1,
    cursorTrail: true,
    intro: { enabled: true, text: 'You are cordially invited' },
    music: { src: '', name: '' },
    photos: [],
    sections: ['countdown', 'story', 'events', 'gallery', 'map', 'rsvp', 'wishes', 'thanks'].map(newSection),
    publish: { repo: '', url: '' },
    weddingId: '',        // public id for the online RSVP / guestbook backend
    admin: { key: '' },   // secret — never published
    invites: [],          // personal invite links: { id, name, slug, maxGuests, events: [eventId] }
  };
}
