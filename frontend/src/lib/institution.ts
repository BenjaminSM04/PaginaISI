import type { ThemeSettings } from './theme';

export interface InstitutionalSettings {
  institutionName: string;
  shortName: string;
  careerName: string;
  institutionalLogoUrl: string;
  careerLogoUrl: string | null;
  institutionalLogoDarkUrl: string | null;
  careerLogoDarkUrl: string | null;
  faviconUrl: string | null;
  logoMaxHeight: number;
  logoMaxWidth: number;
  logoObjectFit: 'contain' | 'scale-down';
  theme: ThemeSettings | null;
  updatedAt: string | null;
}

export const DEFAULT_INSTITUTIONAL_SETTINGS: InstitutionalSettings = {
  institutionName: 'Universidad Privada del Valle',
  shortName: 'Univalle',
  careerName: 'Carrera de Ingeniería de Sistemas',
  institutionalLogoUrl: '/branding/univalle-logo.png',
  careerLogoUrl: null,
  institutionalLogoDarkUrl: null,
  careerLogoDarkUrl: null,
  faviconUrl: null,
  logoMaxHeight: 48,
  logoMaxWidth: 160,
  logoObjectFit: 'contain',
  theme: null,
  updatedAt: null,
};

export function withInstitutionalDefaults(
  value?: Partial<InstitutionalSettings> | null,
): InstitutionalSettings {
  return {
    ...DEFAULT_INSTITUTIONAL_SETTINGS,
    ...value,
    institutionName: value?.institutionName?.trim() || DEFAULT_INSTITUTIONAL_SETTINGS.institutionName,
    shortName: value?.shortName?.trim() || DEFAULT_INSTITUTIONAL_SETTINGS.shortName,
    careerName: value?.careerName?.trim() || DEFAULT_INSTITUTIONAL_SETTINGS.careerName,
    institutionalLogoUrl:
      value?.institutionalLogoUrl?.trim() || DEFAULT_INSTITUTIONAL_SETTINGS.institutionalLogoUrl,
    careerLogoUrl: value?.careerLogoUrl?.trim() || null,
    updatedAt: value?.updatedAt ?? null,
  };
}
