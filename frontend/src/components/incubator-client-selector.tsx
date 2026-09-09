'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, CheckCircle2, Loader2, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { IncubatorClient, MediaAssetLite, Paged } from '@/lib/types';
import {
  RemoteMultiCombobox,
} from '@/components/ui/remote-multi-combobox';
import type {
  RemoteOptionsLoader,
  RemoteOptionsRequest,
} from '@/components/ui/remote-combobox-core';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { MediaUploadButton } from '@/components/media-upload-button';
import { IncubatorClientLogo } from '@/components/incubator-client-logo';

type ClientPage = Paged<IncubatorClient> | IncubatorClient[];

function remotePage(result: ClientPage, request: RemoteOptionsRequest) {
  if (Array.isArray(result)) {
    return {
      items: result,
      page: request.page,
      hasMore: result.length === request.limit,
    };
  }
  const page = result.page ?? request.page;
  return {
    items: result.items,
    page,
    total: result.total,
    hasMore: result.hasMore
      ?? (result.pages !== undefined
        ? page < result.pages
        : result.total > page * (result.limit ?? request.limit)),
  };
}

const loadClients: RemoteOptionsLoader<IncubatorClient> = async (request) => {
  const query = new URLSearchParams({
    q: request.query,
    page: String(request.page),
    limit: String(request.limit),
  });
  return remotePage(
    await api.get<ClientPage>(`/incubator/clients?${query.toString()}`),
    request,
  );
};

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function IncubatorClientSelector({
  value,
  onChange,
  disabled = false,
  label = 'Clientes',
}: {
  value: IncubatorClient[];
  onChange: (clients: IncubatorClient[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [logo, setLogo] = useState<MediaAssetLite | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const pendingLogoRef = useRef<MediaAssetLite | null>(null);

  useEffect(() => () => {
    const pending = pendingLogoRef.current;
    if (pending) void api.delete(`/media/${pending.id}`).catch(() => undefined);
  }, []);

  const discardLogo = (asset: MediaAssetLite | null) => {
    if (!asset) return;
    void api.delete(`/media/${asset.id}`).catch(() => undefined);
  };

  const resetDraft = (removeUpload: boolean) => {
    const pending = pendingLogoRef.current;
    pendingLogoRef.current = null;
    if (removeUpload) discardLogo(pending);
    setName('');
    setLogo(null);
    setError(null);
    setShowCreate(false);
  };

  const uploaded = (asset: MediaAssetLite) => {
    const previous = pendingLogoRef.current;
    pendingLogoRef.current = asset;
    setLogo(asset);
    setError(null);
    if (previous?.id && previous.id !== asset.id) discardLogo(previous);
  };

  const removeLogo = () => {
    const pending = pendingLogoRef.current;
    pendingLogoRef.current = null;
    setLogo(null);
    discardLogo(pending);
  };

  const create = async () => {
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    setError(null);
    setMessage(null);
    if (normalizedName.length < 2 || normalizedName.length > 160) {
      setError('El nombre de la empresa debe tener entre 2 y 160 caracteres.');
      return;
    }
    if (!logo?.url) {
      setError('Carga el logo de la empresa antes de agregarla.');
      return;
    }
    setCreating(true);
    try {
      const client = await api.post<IncubatorClient>('/incubator/clients', {
        name: normalizedName,
        logoUrl: logo.url,
      });
      pendingLogoRef.current = null;
      onChange(value.some((item) => item.id === client.id) ? value : [...value, client]);
      setRequestVersion((current) => current + 1);
      setName('');
      setLogo(null);
      setShowCreate(false);
      setMessage(`“${client.name}” fue registrada y asociada al proyecto.`);
    } catch (cause) {
      setError(messageFrom(cause, 'No se pudo registrar el cliente.'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      <RemoteMultiCombobox
        label={label}
        value={value}
        onChange={onChange}
        loadOptions={loadClients}
        getOptionKey={(client) => client.id}
        getOptionLabel={(client) => client.name}
        renderOption={(client) => (
          <span className="flex min-w-0 items-center gap-3">
            <IncubatorClientLogo client={client} size="sm" />
            <span className="truncate font-medium">{client.name}</span>
          </span>
        )}
        requestKey={`incubator-clients:${requestVersion}`}
        pageSize={20}
        maxSelected={20}
        disabled={disabled}
        placeholder="Busca una empresa registrada…"
        emptyMessage="No hay empresas activas que coincidan."
      />

      {value.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {value.map((client) => (
            <div key={client.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-secondary/30 p-3">
              <IncubatorClientLogo client={client} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{client.name}</span>
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Quitar ${client.name}`}
                  className="rounded-md p-1 text-muted-foreground transition hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onChange(value.filter((item) => item.id !== client.id))}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!showCreate ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setError(null);
            setMessage(null);
            setShowCreate(true);
          }}
        >
          <Plus /> Agregar cliente
        </Button>
      ) : (
        <div className="space-y-4 rounded-xl border border-purple-500/25 bg-purple-500/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-primary">
                <Building2 className="h-4 w-4 text-purple-500" /> Registrar nueva empresa
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Se guardará en la cartera para poder reutilizarla en otros proyectos.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Cancelar alta de cliente"
              disabled={creating}
              onClick={() => resetDraft(true)}
            >
              <X />
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-incubator-client-name">Nombre o razón social *</Label>
            <Input
              id="new-incubator-client-name"
              value={name}
              maxLength={160}
              disabled={creating}
              placeholder="Nombre de la empresa"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                void create();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Logo de la empresa *</Label>
            <MediaUploadButton
              kind="image"
              disabled={creating}
              previewUrl={logo?.url}
              previewAlt={name.trim() ? `Vista previa del logo de ${name.trim()}` : 'Vista previa del logo de la empresa'}
              previewShape="square"
              previewFit="contain"
              onUploaded={uploaded}
              onRemove={removeLogo}
            />
          </div>
          {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
          <div className="flex justify-end">
            <Button type="button" disabled={creating || name.trim().length < 2 || !logo} onClick={() => void create()}>
              {creating ? <Loader2 className="animate-spin" /> : <Plus />}
              Registrar y asociar
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p role="status" className="flex items-center gap-1.5 text-xs font-semibold text-success">
          <CheckCircle2 className="h-4 w-4" /> {message}
        </p>
      )}
    </div>
  );
}
