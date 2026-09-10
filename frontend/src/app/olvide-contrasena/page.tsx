'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, KeyRound, Loader2, Mail } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

interface ForgotResult {
  ok: true;
  message: string;
  previewUrl?: string;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'No se pudo procesar la solicitud';

const safePreviewUrl = (value?: string) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
};

export default function OlvideContrasenaPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ForgotResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = safePreviewUrl(result?.previewUrl);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.post<ForgotResult>('/auth/password/forgot', { email }));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="font-serif-heading text-2xl font-bold text-primary">Recuperar contraseña</h1>
          <p className="mt-1 text-sm text-muted-foreground">Te enviaremos un enlace de un solo uso, válido durante 30 minutos.</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="recovery-email">Correo de tu cuenta</Label>
            <Input id="recovery-email" type="email" autoComplete="email" placeholder="Correo electrónico" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
          </div>
          {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
          {result && (
            <div role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
              <p>{result.message}</p>
              {previewUrl && (
                <p className="mt-2">
                  <a href={previewUrl} className="font-bold underline">Abrir enlace de recuperación</a>
                  <span className="ml-2 text-xs opacity-75">Visible únicamente en localhost.</span>
                </p>
              )}
            </div>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Mail />} Solicitar enlace
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
