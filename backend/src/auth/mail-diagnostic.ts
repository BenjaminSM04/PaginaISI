/** Clasifica errores sin conservar mensajes, destinatarios ni respuestas del proveedor. */
export function mailDiagnostic(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'EAUTH') return 'SMTP_AUTH: el proveedor rechazó las credenciales configuradas';
  if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETLS'].includes(String(code))) {
    return 'SMTP_CONNECTION: revisa DNS, salida de red, puerto y TLS desde el servidor';
  }
  if (code === 'SMTP_CONFIG') return 'SMTP_CONFIG: faltan variables de correo o su configuración no es válida';
  return 'MAIL_DELIVERY: no se pudo confirmar la entrega; revisa el proveedor';
}
