'use client';

import { ChangeEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, Loader2, Save, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Community, MediaAssetLite } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';

const optionalUrl = z.string().url('URL inválida').optional().or(z.literal(''));
const schema = z.object({
  name: z.string().min(3, 'Usa al menos 3 caracteres').max(80),
  description: z.string().min(10, 'Usa al menos 10 caracteres').max(300),
  longDescription: z.string().max(5000).optional(),
  logoUrl: optionalUrl,
  coverUrl: optionalUrl,
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Usa un color hexadecimal como #06B6D4'),
  whatsappUrl: optionalUrl,
  teamsUrl: optionalUrl,
  discordUrl: optionalUrl,
  teacherLeadId: z.string().optional(),
  studentLeadId: z.string().optional(),
  isActive: z.boolean(),
});

type CommunityFormData = z.infer<typeof schema>;
interface Candidate {
  id: string;
  username: string;
  profile?: { fullName?: string } | null;
  roles: { role: { name: string } }[];
}

function defaults(initial?: Community): CommunityFormData {
  return {
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    longDescription: initial?.longDescription ?? '',
    logoUrl: initial?.logoUrl ?? '',
    coverUrl: initial?.coverUrl ?? '',
    accentColor: initial?.accentColor ?? '#06B6D4',
    whatsappUrl: initial?.whatsappUrl ?? '',
    teamsUrl: initial?.teamsUrl ?? '',
    discordUrl: initial?.discordUrl ?? '',
    teacherLeadId: initial?.teacherLeadId ?? initial?.teacherLead?.id ?? '',
    studentLeadId: initial?.studentLeadId ?? initial?.studentLead?.id ?? '',
    isActive: initial?.isActive ?? true,
  };
}

export function CommunityForm({ initial }: { initial?: Community }) {
  const router = useRouter();
  const { user } = useAuth();
  const editing = !!initial;
  const isAdmin = !!user?.roles.includes('ADMIN');
  const [serverError, setServerError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'logoUrl' | 'coverUrl' | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const { data: candidates } = useQuery({
    queryKey: ['community-management-candidates'],
    queryFn: () => api.get<Candidate[]>('/communities/management/candidates'),
    enabled: isAdmin,
    retry: false,
  });
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CommunityFormData>({ resolver: zodResolver(schema), defaultValues: defaults(initial) });
  const logoUrl = useWatch({ control, name: 'logoUrl' });
  const coverUrl = useWatch({ control, name: 'coverUrl' });

  const uploadImage = async (field: 'logoUrl' | 'coverUrl', event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setServerError(null);
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      setServerError('Selecciona una imagen de hasta 8 MB.');
      return;
    }
    setUploading(field);
    try {
      const body = new FormData();
      body.append('file', file);
      const asset = await api.post<MediaAssetLite>('/media/upload', body);
      setValue(field, asset.url, { shouldDirty: true, shouldValidate: true });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'No se pudo optimizar la imagen');
    } finally {
      setUploading(null);
    }
  };

  const onSubmit = async (data: CommunityFormData) => {
    setServerError(null);
    const payload: Record<string, unknown> = {
      name: data.name.trim(),
      description: data.description.trim(),
      longDescription: data.longDescription?.trim() || null,
      logoUrl: data.logoUrl?.trim() || null,
      coverUrl: data.coverUrl?.trim() || null,
      accentColor: data.accentColor,
      whatsappUrl: data.whatsappUrl?.trim() || null,
      teamsUrl: data.teamsUrl?.trim() || null,
      discordUrl: data.discordUrl?.trim() || null,
    };
    if (isAdmin) {
      payload.teacherLeadId = data.teacherLeadId || null;
      payload.studentLeadId = data.studentLeadId || null;
      if (editing) payload.isActive = data.isActive;
    }
    try {
      const community = editing
        ? await api.patch<Community>(`/communities/${initial.id}`, payload)
        : await api.post<Community>('/communities', payload);
      router.push(`/comunidades/${community.slug}`);
      router.refresh();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'No se pudo guardar la comunidad');
    }
  };

  const deactivate = async () => {
    if (!initial || !window.confirm(`¿Desactivar “${initial.name}”? Dejará de aparecer públicamente, pero sus datos se conservarán.`)) return;
    setDeactivating(true);
    setServerError(null);
    try {
      await api.delete(`/communities/${initial.id}`);
      router.push('/comunidades/gestionar');
      router.refresh();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'No se pudo desactivar la comunidad');
      setDeactivating(false);
    }
  };

  const teachers = (candidates ?? []).filter((candidate) => candidate.roles.some((entry) => entry.role.name === 'TEACHER'));
  const leaders = (candidates ?? []).filter((candidate) => candidate.roles.some((entry) => entry.role.name === 'COMMUNITY_LEADER'));

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
      <div className="space-y-1.5">
        <Label htmlFor="community-name">Nombre *</Label>
        <Input id="community-name" {...register('name')} />
        {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="community-description">Descripción breve *</Label>
        <Textarea id="community-description" rows={3} {...register('description')} />
        {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="community-long-description">Presentación completa</Label>
        <Textarea id="community-long-description" rows={6} {...register('longDescription')} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {([
          ['logoUrl', 'Logotipo', logoUrl],
          ['coverUrl', 'Portada', coverUrl],
        ] as const).map(([field, label, preview]) => (
          <div key={field} className="space-y-2 rounded-xl border border-border bg-secondary/30 p-4">
            <Label>{label}</Label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:border-primary/50">
              {uploading === field ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {uploading === field ? 'Optimizando…' : 'Subir y comprimir'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={!!uploading} onChange={(event) => void uploadImage(field, event)} />
            </label>
            <Input aria-label={`URL de ${label.toLowerCase()}`} placeholder="https://…" {...register(field)} />
            {errors[field] && <p className="text-xs text-red-500">{errors[field]?.message}</p>}
            {preview && <img src={preview} alt={`Vista previa: ${label}`} className={`w-full rounded-lg border border-border object-cover ${field === 'logoUrl' ? 'h-28 object-contain' : 'h-28'}`} />}
          </div>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="community-color">Color identificador</Label>
          <div className="flex gap-2">
            <Input id="community-color" type="color" className="w-14 p-1" {...register('accentColor')} />
            <Input aria-label="Color hexadecimal" {...register('accentColor')} />
          </div>
          {errors.accentColor && <p className="text-xs text-red-500">{errors.accentColor.message}</p>}
        </div>
        <div />
        <div className="space-y-1.5"><Label htmlFor="community-whatsapp">WhatsApp</Label><Input id="community-whatsapp" placeholder="https://…" {...register('whatsappUrl')} />{errors.whatsappUrl && <p className="text-xs text-red-500">{errors.whatsappUrl.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="community-teams">Microsoft Teams</Label><Input id="community-teams" placeholder="https://…" {...register('teamsUrl')} />{errors.teamsUrl && <p className="text-xs text-red-500">{errors.teamsUrl.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="community-discord">Discord</Label><Input id="community-discord" placeholder="https://…" {...register('discordUrl')} />{errors.discordUrl && <p className="text-xs text-red-500">{errors.discordUrl.message}</p>}</div>
      </div>

      {isAdmin && (
        <section className="grid gap-5 rounded-xl border border-border p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="community-teacher">Docente asesor</Label>
            <Select id="community-teacher" {...register('teacherLeadId')}><option value="">Sin asignar</option>{teachers.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.profile?.fullName ?? candidate.username}</option>)}</Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="community-leader">Líder estudiantil</Label>
            <Select id="community-leader" {...register('studentLeadId')}><option value="">Sin asignar</option>{leaders.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.profile?.fullName ?? candidate.username}</option>)}</Select>
          </div>
          {editing && (
            <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
              <input type="checkbox" className="h-4 w-4 accent-[#06B6D4]" {...register('isActive')} /> Comunidad activa y visible públicamente
            </label>
          )}
        </section>
      )}

      {serverError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{serverError}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" size="lg" className="flex-1" disabled={isSubmitting || !!uploading || deactivating}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} {isSubmitting ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear comunidad'}
        </Button>
        {isAdmin && editing && initial.isActive !== false && (
          <Button type="button" size="lg" variant="destructive" disabled={deactivating || isSubmitting} onClick={deactivate}>
            {deactivating ? <Loader2 className="animate-spin" /> : <Trash2 />} {deactivating ? 'Desactivando…' : 'Desactivar'}
          </Button>
        )}
      </div>
    </form>
  );
}
