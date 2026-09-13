import { z } from 'zod';

export const registrationSchema = z.object({
  fullName: z.string().trim().min(3, 'Ingresa tu nombre completo').max(80),
  email: z.string().trim().toLowerCase().email('Correo inválido').max(254)
    .regex(/^[^\s@]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*univalle\.edu$/, 'Usa tu correo de univalle.edu o de un subdominio institucional, como est.univalle.edu'),
  username: z.string().trim().toLowerCase().min(3, 'Mínimo 3 caracteres').max(30)
    .regex(/^[a-z0-9_.-]+$/, 'Solo minúsculas, números, punto, guion y guion bajo'),
  semester: z.string().optional().refine(value => !value || /^[1-8]$/.test(value), 'Selecciona un semestre entre 1º y 8º'),
  password: z.string().min(12, 'Mínimo 12 caracteres').max(72)
    .refine(value => new TextEncoder().encode(value).length <= 72, 'La contraseña es demasiado larga; utiliza menos caracteres'),
  confirm: z.string(),
}).refine(data => data.password === data.confirm, { message: 'Las contraseñas no coinciden', path: ['confirm'] });
