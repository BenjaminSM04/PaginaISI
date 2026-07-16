import sanitizeHtml from 'sanitize-html';

export function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

export function uniqueSlug(base: string): string {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slugify(base)}-${suffix}`;
}

export function clean(input?: string | null): string | undefined {
  if (input === undefined || input === null) return undefined;
  return sanitizeHtml(input, {
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'img'],
    allowedAttributes: { a: ['href'], img: ['src', 'alt'] },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}

export function paginate(page?: number, limit?: number) {
  const take = Math.min(Math.max(Number(limit) || 12, 1), 50);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
  return { take, skip, page: Math.max(Number(page) || 1, 1) };
}
