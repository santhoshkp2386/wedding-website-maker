// Google Fonts used by templates. Values are Google Fonts css2 "family=" query strings.
export const FONTS = {
  'Cinzel': 'Cinzel:wght@400;600;700',
  'Cormorant Garamond': 'Cormorant+Garamond:ital,wght@0,400;0,600;1,400',
  'Great Vibes': 'Great+Vibes',
  'Lora': 'Lora:ital,wght@0,400;0,600;1,400',
  'Playfair Display': 'Playfair+Display:ital,wght@0,400;0,700;1,400',
  'Raleway': 'Raleway:wght@300;400;600',
  'Dancing Script': 'Dancing+Script:wght@400;700',
  'Quicksand': 'Quicksand:wght@400;600',
  'Italiana': 'Italiana',
  'Montserrat': 'Montserrat:wght@300;400;600',
  'Parisienne': 'Parisienne',
  'Nunito': 'Nunito:wght@300;400;700',
  'Kaushan Script': 'Kaushan+Script',
  'Mukta': 'Mukta:wght@300;400;600',
  'Marcellus': 'Marcellus',
  'Josefin Sans': 'Josefin+Sans:wght@300;400;600',
  'Alex Brush': 'Alex+Brush',
  'Tangerine': 'Tangerine:wght@400;700',
  'Yatra One': 'Yatra+One',
  'Poppins': 'Poppins:wght@300;400;600',
};

const SCRIPT = new Set(['Great Vibes', 'Dancing Script', 'Parisienne', 'Kaushan Script', 'Alex Brush', 'Tangerine', 'Yatra One']);
const SANS = new Set(['Raleway', 'Quicksand', 'Montserrat', 'Nunito', 'Mukta', 'Josefin Sans', 'Poppins']);

export function fontStack(name) {
  const fallback = SCRIPT.has(name) ? 'cursive' : SANS.has(name) ? 'sans-serif' : 'serif';
  return `'${name}', ${fallback}`;
}

export function fontsHref(names) {
  const fam = [...new Set(names)].filter(n => FONTS[n]).map(n => 'family=' + FONTS[n]);
  return fam.length ? 'https://fonts.googleapis.com/css2?' + fam.join('&') + '&display=swap' : '';
}
