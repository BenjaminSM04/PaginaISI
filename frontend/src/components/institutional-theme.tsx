'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useInstitutionalSettings } from '@/lib/use-institutional-settings';
import { resolveTheme, themeCss } from '@/lib/theme';

export function InstitutionalTheme() {
  const { settings } = useInstitutionalSettings();
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const icons = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'));
    const originals = icons.map(icon => ({ icon, href: icon.getAttribute('href'), type: icon.getAttribute('type'), sizes: icon.getAttribute('sizes') }));
    if (settings.faviconUrl) for (const icon of icons) {
      icon.href = settings.faviconUrl;
      icon.removeAttribute('type');
      icon.removeAttribute('sizes');
    }
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColor) themeColor.content = resolveTheme(settings.theme)[resolvedTheme === 'dark' ? 'dark' : 'light'].primary;
    return () => { for (const { icon, href, type, sizes } of originals) {
      for (const [key, value] of Object.entries({ href, type, sizes })) {
        if (value === null) icon.removeAttribute(key); else icon.setAttribute(key, value);
      }
    } };
  }, [settings.faviconUrl, settings.theme, resolvedTheme]);
  return <style data-institution-theme>{themeCss(settings.theme)}</style>;
}
